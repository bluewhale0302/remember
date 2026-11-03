(() => {
  const STORAGE_KEY = 'eoreumotWords';
  const API_KEY_STORAGE = 'eoreumotDictionaryKey';
  const CONFIG_API_KEY = String(window.APP_CONFIG?.dictionaryApiKey || '').trim();
  const getApiKey = () => localStorage.getItem(API_KEY_STORAGE) || (CONFIG_API_KEY.includes('여기에_') ? '' : CONFIG_API_KEY);
  const SUPABASE_URL = String(window.APP_CONFIG?.supabaseUrl || '').trim();
  const SUPABASE_KEY = String(window.APP_CONFIG?.supabaseAnonKey || '').trim();
  const isSupabaseConfigured = /^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(SUPABASE_URL) && SUPABASE_KEY.length > 20 && !SUPABASE_KEY.includes('YOUR_');
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const makeId = () => window.crypto?.randomUUID?.() || 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g,char=>{const value=Math.random()*16|0;return(char==='x'?value:(value&0x3|0x8)).toString(16);});
  let supabaseClient = null;
  let currentUser = null;
  let words = [];
  let authMode = 'signin';
  let editingId = null;
  let lookupTimer = null;
  let lookupRequest = 0;
  let activePage = 'today';
  const selectedIds = new Set();

  const today = new Date();
  $('#todayDate').textContent = new Intl.DateTimeFormat('ko-KR',{month:'long',day:'numeric'}).format(today);
  $('#longDate').textContent = new Intl.DateTimeFormat('ko-KR',{year:'numeric',month:'long',day:'numeric',weekday:'long'}).format(today);

  async function persist() {
    if (!supabaseClient || !currentUser) return;
    const rows = words.map(word => ({
      id: word.id, user_id: currentUser.id, word: word.word, clue: word.clue || '',
      meaning: word.meaning || '', example: word.example || '', category: word.category || '단어',
      confused: word.confused || '', difference: word.difference || '', tone: word.tone || 'green',
      source: word.source || 'manual', date_label: word.date || '오늘',
      ...(word.created_at ? {created_at: word.created_at} : {})
    }));
    try {
      if (rows.length) {
        const {error} = await supabaseClient.from('words').upsert(rows, {onConflict:'id'});
        if (error) throw error;
      }
      const {data:remoteRows,error:readError} = await supabaseClient.from('words').select('id').eq('user_id',currentUser.id);
      if (readError) throw readError;
      const keep = new Set(words.map(word => word.id));
      const obsolete = (remoteRows || []).map(row => row.id).filter(id => !keep.has(id));
      if (obsolete.length) {
        const {error} = await supabaseClient.from('words').delete().eq('user_id',currentUser.id).in('id',obsolete);
        if (error) throw error;
      }
      render();
    } catch (error) {
      showToast(`저장하지 못했어요: ${error.message || '데이터베이스 연결을 확인해 주세요.'}`);
      await loadAccountWords();
    }
  }
  function showToast(message) {
    const toast = $('#toast');
    toast.textContent = message;
    toast.classList.add('show');
    clearTimeout(showToast.timer);
    showToast.timer = setTimeout(() => toast.classList.remove('show'), 2100);
  }
  function navigate(page) {
    activePage = page;
    $$('.nav-item').forEach(button => button.classList.toggle('active', button.dataset.page === page));
    $$('.page').forEach(section => section.classList.toggle('active', section.id === `page-${page}`));
    $('#addWord').style.display = page === 'review' ? 'none' : '';
    if (page === 'words') renderAllWords();
    if (page === 'review') renderReview();
    window.scrollTo({top:0,behavior:'smooth'});
  }
  function icon(name) {
    if (name === 'edit') return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4Z"/></svg>';
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 7h16M10 11v6m4-6v6M5 7l1 14h12l1-14M9 7V4h6v3"/></svg>';
  }
  function wordCard(word, selectable = false) {
    const isSelected = selectedIds.has(word.id);
    const details = [
      word.meaning && `<span><b>뜻</b> ${escapeHtml(word.meaning)}</span>`,
      word.example && `<span><b>예문</b> ${escapeHtml(word.example)}</span>`,
      word.confused && `<span><b>헷갈린 단어</b> ${escapeHtml(word.confused)}</span>`,
      word.difference && `<span><b>차이</b> ${escapeHtml(word.difference)}</span>`
    ].filter(Boolean).join('');
    return `<article class="word-card ${selectable ? 'selectable' : ''} ${isSelected ? 'selected' : ''}" data-word-id="${escapeHtml(word.id)}">
      ${selectable?`<input class="word-checkbox" type="checkbox" aria-label="${escapeHtml(word.word)} 선택" data-select-id="${escapeHtml(word.id)}" ${isSelected?'checked':''}>`:''}
      <div class="word-icon ${escapeHtml(word.tone||'green')}">✳</div>
      <div class="word-content"><div class="word-top"><span class="word-name">${escapeHtml(word.word)}</span><span class="word-pos">${escapeHtml(word.category||'단어')}</span><span class="word-date">${escapeHtml(word.date||'')}</span></div>
      <div class="word-clue">${escapeHtml(word.clue||'기억해둘 단서를 추가해보세요.')}</div>${details?`<div class="word-meta">${details}</div>`:''}</div>
      <div class="word-actions"><button class="icon-button edit-word" type="button" data-edit-id="${escapeHtml(word.id)}" aria-label="${escapeHtml(word.word)} 수정" title="수정">${icon('edit')}</button>${selectable?`<button class="icon-button delete-word" type="button" data-delete-id="${escapeHtml(word.id)}" aria-label="${escapeHtml(word.word)} 삭제" title="삭제">${icon('delete')}</button>`:''}</div>
    </article>`;
  }
  function renderRecent() {
    const recent = [...words].slice(0,4);
    $('#recentList').innerHTML = recent.length ? recent.map(word => wordCard(word)).join('') : '<div class="empty">아직 저장한 단어가 없어요.<br>오늘 놓친 단어를 하나 기록해볼까요?</div>';
  }
  function renderAllWords() {
    $('#allList').innerHTML = words.length ? words.map(word => wordCard(word,true)).join('') : '<div class="empty">아직 저장한 단어가 없어요.<br>단어를 기록하면 이곳에 모아둘게요.</div>';
    bindWordActions($('#allList'));
    updateSelectionUI();
  }
  function renderReview() {
    if (!words.length) { $('#reviewList').innerHTML = '<div class="empty">복습할 단어가 없어요. 단어를 추가하면 여기에 나타나요.</div>'; return; }
    $('#reviewList').innerHTML = words.map((word,index) => `<article class="review-card"><div class="review-kicker">MEMORY CHECK　${String(index+1).padStart(2,'0')}</div><h3>이 단서, 어떤 단어였을까요?</h3><p>기억의 조각을 보고 단어를 떠올려보세요.</p><div class="review-prompt">${escapeHtml(word.clue||word.meaning||'이 단어를 떠올려보세요.')}</div><div class="review-actions"><button type="button" data-reveal="${escapeHtml(word.id)}">정답 확인하기 ✳</button><button type="button" data-edit-id="${escapeHtml(word.id)}">기록 수정</button></div><div class="answer" id="answer-${escapeHtml(word.id)}">${escapeHtml(word.word)}${word.meaning?` <span>· ${escapeHtml(word.meaning)}</span>`:''}</div></article>`).join('');
    $$('[data-reveal]', $('#reviewList')).forEach(button => button.onclick = () => { const answer=$(`#answer-${CSS.escape(button.dataset.reveal)}`); answer.style.display='block'; button.textContent='기억했어요 ✓'; });
    bindWordActions($('#reviewList'));
  }
  function render() {
    $('#wordCount').textContent = String(words.length).padStart(2,'0');
    $('#reviewCount').textContent = String(words.length).padStart(2,'0');
    $('#weekCount').textContent = String(Math.min(words.length,7));
    renderRecent();
    if (activePage === 'words') renderAllWords();
    if (activePage === 'review') renderReview();
    bindWordActions($('#recentList'));
    renderSearch($('#searchInput').value);
  }
  function openWordModal(id = null, clue = '') {
    editingId = id;
    const word = words.find(entry => entry.id === id);
    $('#wordForm').reset();
    $('#dictionaryChoices').innerHTML = '';
    $('#dictionaryStatus').textContent = '';
    $('#modalTitle').textContent = word ? '기억의 조각 수정하기' : '기억의 조각 남기기';
    $('#saveWord').textContent = word ? '수정 내용 저장하기　↗' : '기억 저장하기　↗';
    if (word) {
      $('#wordInput').value=word.word||''; $('#clueInput').value=word.clue||'';
      $('#meaningInput').value=word.meaning||''; $('#exampleInput').value=word.example||'';
      $('#posInput').value=word.category||''; $('#confusedInput').value=word.confused||'';
      $('#differenceInput').value=word.difference||'';
    } else $('#clueInput').value = clue ? `찾으려던 단서: ${clue}` : '';
    $('#wordModal').classList.add('open'); $('#wordModal').setAttribute('aria-hidden','false');
    $('#wordInput').focus();
    if (word && word.meaning) $('#dictionaryStatus').textContent = word.source === 'krdict' ? '국립국어원 사전' : '';
  }
  function closeModal(id) { const modal=$(`#${id}`); modal.classList.remove('open'); modal.setAttribute('aria-hidden','true'); }
  function bindWordActions(root) {
    $$('[data-edit-id]',root).forEach(button => button.onclick = () => openWordModal(button.dataset.editId));
    $$('[data-delete-id]',root).forEach(button => button.onclick = () => deleteOne(button.dataset.deleteId));
    $$('[data-select-id]',root).forEach(box => box.onchange = () => { box.checked?selectedIds.add(box.dataset.selectId):selectedIds.delete(box.dataset.selectId); box.closest('.word-card').classList.toggle('selected',box.checked); updateSelectionUI(); });
  }
  function deleteOne(id) {
    const word=words.find(entry=>entry.id===id); if(!word)return;
    if(!window.confirm(`“${word.word}” 기록을 삭제할까요?`))return;
    words=words.filter(entry=>entry.id!==id); selectedIds.delete(id); persist(); showToast('단어 기록을 삭제했어요.');
  }
  function updateSelectionUI() {
    const count=selectedIds.size;
    $('#selectedCount').textContent=`선택한 단어 ${count}개`;
    $('#deleteSelected').disabled=count===0;
    $('#selectAll').checked=words.length>0&&count===words.length;
    $('#selectAll').indeterminate=count>0&&count<words.length;
  }
  function deleteSelected() {
    if (!selectedIds.size) return;
    const count=selectedIds.size;
    if (!window.confirm(`선택한 ${count}개 단어 기록을 삭제할까요?`)) return;
    words=words.filter(word=>!selectedIds.has(word.id)); selectedIds.clear(); persist(); showToast(`${count}개 단어를 삭제했어요.`);
  }
  function searchScore(query, word) {
    const fields=[word.word,word.clue,word.meaning,word.example,word.confused,word.difference,word.category].join(' ').toLowerCase();
    const q=query.toLowerCase();
    if(fields.includes(q))return 0;
    const tokens=q.split(/\s+/).filter(Boolean);
    return tokens.length&&tokens.some(token=>fields.includes(token))?1:99;
  }
  function renderSearch(raw) {
    const box=$('#searchResults'), query=raw.trim();
    if(!query){box.classList.remove('open');box.innerHTML='';return;}
    const matches=words.map(word=>({word,score:searchScore(query,word)})).filter(result=>result.score<99).sort((a,b)=>a.score-b.score).slice(0,6);
    box.classList.add('open');
    box.innerHTML=matches.length?matches.map(({word})=>`<div class="result-row" data-result-id="${escapeHtml(word.id)}"><div><div class="result-word">${escapeHtml(word.word)}</div><div class="result-hint">${escapeHtml(word.clue||word.meaning||'저장된 단어')}</div></div><span class="result-hint">기억 열기 ↗</span></div>`).join(''):'<div class="result-row"><div><div class="result-word">아직 저장된 기억이 없어요</div><div class="result-hint">단어를 찾으면 기록해두고 다음에 더 빨리 찾아보세요.</div></div></div>';
    $$('[data-result-id]',box).forEach(row=>row.onclick=()=>openWordModal(row.dataset.resultId));
  }
  function setDictionaryStatus(text, error=false) { const status=$('#dictionaryStatus');status.textContent=text;status.style.color=error?'#b64e3e':''; }
  function readDictionaryItems(xmlText) {
    const xml=new DOMParser().parseFromString(xmlText,'application/xml');
    if(xml.querySelector('parsererror'))throw new Error('사전 응답을 읽지 못했어요.');
    const error=xml.querySelector('error message'); if(error)throw new Error(error.textContent||'사전 검색에 실패했어요.');
    return [...xml.querySelectorAll('channel > item')].map(item=>{
      const text=tag=>item.querySelector(tag)?.textContent?.trim()||'';
      const definitions=[...item.querySelectorAll('sense > definition')].map(node=>node.textContent.trim()).filter(Boolean);
      const examples=[...item.querySelectorAll('sense > example, example')].map(node=>node.textContent.trim()).filter(Boolean);
      return {word:text('word'),pos:text('pos'),meaning:[...new Set(definitions)].join('\n'),example:[...new Set(examples)].join('\n'),link:text('link')};
    }).filter(item=>item.word&&item.meaning);
  }
  async function lookupDictionary(query, requestId) {
    const apiKey=getApiKey();
    if(!apiKey){setDictionaryStatus('먼저 사전 설정에서 인증키를 입력해 주세요.');return;}
    setDictionaryStatus('사전에서 뜻을 찾는 중…');
    const params=new URLSearchParams({key:apiKey,q:query,part:'word',sort:'popular',num:'10'});
    const controller=new AbortController(); const timeout=setTimeout(()=>controller.abort(),12000);
    try {
      const response=await fetch(`https://krdict.korean.go.kr/api/search?${params}`,{signal:controller.signal});
      if(!response.ok)throw new Error(`사전 요청에 실패했어요 (${response.status}).`);
      const results=readDictionaryItems(await response.text());
      if(requestId!==lookupRequest)return;
      if(!results.length){setDictionaryStatus('사전에서 찾지 못했어요. 직접 적어둘 수 있어요.',true);return;}
      if(results.length===1||results[0].word===query){applyDictionaryResult(results[0]);return;}
      showDictionaryChoices(results.slice(0,5));
      setDictionaryStatus('뜻이 맞는 항목을 골라주세요.');
    } catch(error) {
      if(requestId!==lookupRequest)return;
      setDictionaryStatus(error.name==='AbortError'?'사전 응답이 늦어요. 잠시 후 다시 시도해 주세요.':`${error.message} 브라우저 연결을 확인해 주세요.`,true);
    } finally { clearTimeout(timeout); }
  }
  function showDictionaryChoices(results) {
    $('#dictionaryChoices').innerHTML=results.map((item,index)=>`<button type="button" class="dictionary-choice" data-choice="${index}"><strong>${escapeHtml(item.word)}</strong>${escapeHtml(item.pos)} · ${escapeHtml(item.meaning.split('\n')[0])}</button>`).join('');
    $$('.dictionary-choice').forEach((button,index)=>button.onclick=()=>applyDictionaryResult(results[index]));
  }
  function applyDictionaryResult(item) {
    if(!$('#meaningInput').value.trim())$('#meaningInput').value=item.meaning;
    if(!$('#exampleInput').value.trim()&&item.example)$('#exampleInput').value=item.example;
    if(!$('#posInput').value.trim())$('#posInput').value=item.pos;
    if(!$('#wordInput').value.trim())$('#wordInput').value=item.word;
    $('#dictionaryChoices').innerHTML='';
    $('#dictionaryStatus').innerHTML=`<a href="${escapeHtml(item.link)}" target="_blank" rel="noreferrer">국립국어원 한국어기초사전에서 가져왔어요 ↗</a>`;
  }
  function onWordInput() {
    clearTimeout(lookupTimer);
    const query=$('#wordInput').value.trim();
    $('#dictionaryChoices').innerHTML='';
    if(query.length<2){setDictionaryStatus('');return;}
    if(!getApiKey()){setDictionaryStatus('사전 설정에서 인증키를 입력하면 자동으로 채워져요.');return;}
    lookupTimer=setTimeout(()=>{const requestId=++lookupRequest;lookupDictionary(query,requestId);},500);
  }
  function openSettings() { $('#apiKeyInput').value=getApiKey();$('#settingsModal').classList.add('open');$('#settingsModal').setAttribute('aria-hidden','false'); }

  function setAuthStatus(message, error = false) {
    const status=$('#authStatus');status.textContent=message;status.classList.toggle('error',error);
  }
  function updateAuthMode() {
    const signingUp=authMode==='signup';
    $('#authTitle').textContent=signingUp?'회원가입':'로그인';
    $('#authSubmit').textContent=signingUp?'계정 만들기':'로그인';
    $('#authSwitch').textContent=signingUp?'이미 계정이 있나요? 로그인':'계정이 없나요? 회원가입';
    $('#authPassword').autocomplete=signingUp?'new-password':'current-password';
  }
  function oldLocalWords() {
    try { const value=JSON.parse(localStorage.getItem(STORAGE_KEY)||'null');return Array.isArray(value)?value:[]; }
    catch { return []; }
  }
  function updateMigrationBanner() {
    const old=oldLocalWords();
    const alreadyImported=localStorage.getItem(`eoreumotImported:${currentUser?.id}`)==='yes';
    $('#migrationBanner').hidden=!currentUser||old.length===0||alreadyImported;
    if(old.length)$('#migrationBanner span').textContent=`이 브라우저에 예전 단어 ${old.length}개가 있어요. 현재 계정으로 가져올까요?`;
  }
  async function importOldWords() {
    const previous=oldLocalWords();
    if(!currentUser||!previous.length)return;
    const imported=previous.map((item,index)=>({
      id:makeId(),user_id:currentUser.id,word:String(item.word||'').trim(),clue:String(item.clue||''),meaning:String(item.meaning||''),
      example:String(item.example||''),category:String(item.category||'단어'),confused:String(item.confused||''),difference:String(item.difference||''),
      tone:String(item.tone||['green','peach','lav'][index%3]),source:String(item.source||'manual'),date_label:String(item.date||'오늘')
    })).filter(item=>item.word);
    if(!imported.length){$('#migrationBanner').hidden=true;return;}
    const button=$('#importOldWords');button.disabled=true;button.textContent='가져오는 중…';
    const {error}=await supabaseClient.from('words').insert(imported);
    button.disabled=false;button.textContent='기존 단어 가져오기';
    if(error){showToast(`가져오지 못했어요: ${error.message}`);return;}
    localStorage.setItem(`eoreumotImported:${currentUser.id}`,'yes');
    await loadAccountWords();showToast(`${imported.length}개 단어를 계정에 가져왔어요.`);
  }
  async function loadAccountWords() {
    if(!supabaseClient||!currentUser)return;
    const {data,error}=await supabaseClient.from('words').select('*').eq('user_id',currentUser.id).order('created_at',{ascending:false});
    if(error){words=[];render();showToast(`단어를 불러오지 못했어요: ${error.message}`);return;}
    words=(data||[]).map(row=>({
      id:row.id,word:row.word,clue:row.clue,meaning:row.meaning,example:row.example,category:row.category,
      confused:row.confused,difference:row.difference,tone:row.tone,source:row.source,date:row.date_label,created_at:row.created_at
    }));
    render();updateMigrationBanner();
  }
  async function applySession(session) {
    const user=session?.user||null;
    if(user?.id===currentUser?.id)return;
    currentUser=user;
    if(!user){
      words=[];selectedIds.clear();document.body.classList.remove('app-ready');$('#accountEmail').textContent='';
      $('#migrationBanner').hidden=true;setAuthStatus('');return;
    }
    selectedIds.clear();
    document.body.classList.add('app-ready');
    $('#accountEmail').textContent=user.email||'';
    await loadAccountWords();navigate('today');
  }
  function initializeAuth() {
    if(!isSupabaseConfigured||!window.supabase?.createClient){
      $('#setupNotice').hidden=false;$('#authForm').hidden=true;
      setAuthStatus('Supabase 프로젝트를 config.js에 연결하면 로그인 기능이 열립니다.',true);return;
    }
    supabaseClient=window.supabase.createClient(SUPABASE_URL,SUPABASE_KEY);
    supabaseClient.auth.onAuthStateChange((_event,session)=>{setTimeout(()=>applySession(session),0);});
    supabaseClient.auth.getSession().then(({data,error})=>{
      if(error){setAuthStatus(error.message,true);return;}
      applySession(data.session);
    });
  }

  $$('.nav-item').forEach(button=>button.onclick=()=>navigate(button.dataset.page));
  $$('[data-goto]').forEach(button=>button.onclick=()=>navigate(button.dataset.goto));
  $('#addWord').onclick=()=>openWordModal(); $('#addWordTop').onclick=()=>openWordModal();
  $('#dictionarySettings').onclick=openSettings;
  $$('[data-close]').forEach(button=>button.onclick=()=>closeModal(button.dataset.close));
  $$('.modal-back').forEach(backdrop=>backdrop.addEventListener('click',event=>{if(event.target===backdrop)closeModal(backdrop.id);}));
  $('#wordInput').addEventListener('input',onWordInput);
  $('#wordInput').addEventListener('change',onWordInput);
  $('#wordForm').addEventListener('submit',event=>{
    event.preventDefault();
    const existing=words.find(word=>word.id===editingId);
    const entry={id:editingId||makeId(),word:$('#wordInput').value.trim(),clue:$('#clueInput').value.trim(),meaning:$('#meaningInput').value.trim(),example:$('#exampleInput').value.trim(),category:$('#posInput').value.trim()||'단어',confused:$('#confusedInput').value.trim(),difference:$('#differenceInput').value.trim(),date:existing?.date||'오늘',tone:existing?.tone||['green','peach','lav'][words.length%3],source:$('#dictionaryStatus').textContent.includes('국립국어원')?'krdict':existing?.source||'manual'};
    if(editingId){words=words.map(word=>word.id===editingId?entry:word);showToast('단어 기록을 수정했어요.');}
    else{words.unshift(entry);showToast('기억의 조각을 저장했어요.');}
    persist(); closeModal('wordModal'); editingId=null;
  });
  $('#selectAll').onchange=()=>{if($('#selectAll').checked)words.forEach(word=>selectedIds.add(word.id));else selectedIds.clear();renderAllWords();};
  $('#deleteSelected').onclick=deleteSelected;
  $('#deleteAll').onclick=()=>{if(!words.length)return;if(!window.confirm(`저장된 단어 ${words.length}개를 모두 삭제할까요? 이 작업은 되돌릴 수 없어요.`))return;words=[];selectedIds.clear();persist();showToast('모든 단어를 삭제했어요.');};
  $('#saveApiKey').onclick=()=>{const key=$('#apiKeyInput').value.trim();if(!/^[a-f\d]{32}$/i.test(key)){showToast('인증키는 32자리 16진수여야 해요.');return;}localStorage.setItem(API_KEY_STORAGE,key);closeModal('settingsModal');showToast('사전 인증키를 저장했어요.');};
  $('#clearApiKey').onclick=()=>{localStorage.removeItem(API_KEY_STORAGE);$('#apiKeyInput').value='';showToast('저장한 사전 키를 삭제했어요.');};
  $('#searchInput').addEventListener('input',event=>renderSearch(event.target.value));
  $('#searchInput').addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();const query=event.target.value.trim();const match=words.find(word=>searchScore(query,word)<99);if(match)openWordModal(match.id);else if(query)openWordModal(null,query);}});
  $$('.chip').forEach(button=>button.onclick=()=>{$('#searchInput').value=button.dataset.query;renderSearch(button.dataset.query);$('#searchInput').focus();});
  $('#authSwitch').onclick=()=>{authMode=authMode==='signin'?'signup':'signin';updateAuthMode();setAuthStatus('');};
  $('#resetPassword').onclick=async()=>{
    if(!supabaseClient){setAuthStatus('먼저 Supabase 프로젝트 설정을 완료해 주세요.',true);return;}
    const email=$('#authEmail').value.trim();
    if(!email){setAuthStatus('비밀번호 재설정 메일을 받을 이메일을 입력해 주세요.',true);$('#authEmail').focus();return;}
    const {error}=await supabaseClient.auth.resetPasswordForEmail(email,{redirectTo:window.location.origin});
    setAuthStatus(error?error.message:'비밀번호 재설정 안내를 이메일로 보냈어요.',Boolean(error));
  };
  $('#authForm').addEventListener('submit',async event=>{
    event.preventDefault();
    if(!supabaseClient){setAuthStatus('먼저 Supabase 프로젝트 설정을 완료해 주세요.',true);return;}
    const email=$('#authEmail').value.trim(),password=$('#authPassword').value;
    const submit=$('#authSubmit');submit.disabled=true;setAuthStatus(authMode==='signup'?'계정을 만드는 중…':'로그인 중…');
    const result=authMode==='signup'
      ? await supabaseClient.auth.signUp({email,password})
      : await supabaseClient.auth.signInWithPassword({email,password});
    submit.disabled=false;
    if(result.error){setAuthStatus(result.error.message,true);return;}
    if(authMode==='signup'&&!result.data.session){setAuthStatus('가입 확인 메일을 보냈어요. 메일 인증을 마친 뒤 로그인해 주세요.');return;}
    setAuthStatus('로그인하고 있어요…');
  });
  $('#signOut').onclick=async()=>{if(!supabaseClient)return;const {error}=await supabaseClient.auth.signOut();if(error)showToast(`로그아웃하지 못했어요: ${error.message}`);};
  $('#importOldWords').onclick=importOldWords;
  $('#dismissImport').onclick=()=>{$('#migrationBanner').hidden=true;};
  initializeAuth();
})();
