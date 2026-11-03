# 어렴풋

자주 잊거나 한참 헤맨 단어를 기억의 조각으로 저장하고, 나중에 다시 찾아보는 개인용 웹앱입니다.

## 실행

설치나 빌드 없이 저장소 루트의 `index.html`, `styles.css`, `app.js`, `config.example.js`를 함께 올리면 됩니다. GitHub Pages는 기본 브랜치의 `/ (root)`를 게시 소스로 선택하세요.

## Supabase 데이터베이스 연결

1. Supabase에서 새 프로젝트를 만듭니다.
2. **SQL Editor**에서 [`database/schema.sql`](database/schema.sql) 전체를 실행합니다. 이 스키마는 사용자별 `user_id`와 RLS 정책을 적용해 로그인한 사용자가 자기 단어만 읽고 변경하게 합니다.
3. Supabase 프로젝트 URL과 **publishable** 키(또는 legacy `anon` 키)를 `config.example.js`의 `supabaseUrl`, `supabaseAnonKey`에 넣습니다. 이 공개 키는 브라우저에서 쓰도록 만든 키이며, `service_role` 키는 절대 넣지 마세요.
4. Supabase **Authentication → URL Configuration**에서 배포 사이트 URL을 허용하고 이메일/비밀번호 로그인을 켭니다.
5. 파일을 GitHub에 올리고 Pages에 게시합니다. 각 사용자는 이메일과 비밀번호로 회원가입하고 로그인합니다.

Supabase 프로젝트 URL과 publishable/anon 키는 브라우저에 공개되는 설정입니다. 실제 접근 제한은 데이터베이스의 RLS 정책이 담당합니다. SQL 스키마를 실행하지 않았거나 설정 값이 잘못되면 로그인 대신 설정 안내가 표시됩니다.

## 주요 기능

- 오늘의 기억, 내 단어, 다시 볼 단어를 각각 별도 화면으로 제공
- 단어별 수정과 삭제, 체크한 기록 일괄 삭제, 전체 삭제
- 단서, 뜻, 예문, 헷갈린 단어와 차이 기록
- 국립국어원 한국어기초사전 Open API를 이용한 뜻풀이·예문 자동 입력
- 브라우저 `localStorage`에 단어와 개인 설정 저장

## 사전 자동 입력 설정

1. [한국어기초사전 Open API 안내](https://krdict.korean.go.kr/kor/openApi/openApiInfo)에서 인증키를 발급받습니다.
2. 배포 사이트에서는 오른쪽 위 **사전 설정**에 각 사용자의 키를 저장합니다. 개인 로컬 실행용 키는 Git에 제외된 `config.js`의 `dictionaryApiKey`에 넣을 수 있습니다.
3. 단어 기록 창에서 단어를 입력하면 사전 결과가 자동으로 조회됩니다. 여러 뜻이 있으면 알맞은 항목을 선택하세요.

사전 인증키는 사용자의 브라우저에 저장되고 사전 요청 때 한국어기초사전으로 전송됩니다. 실제 키를 공개 저장소에 넣지 마세요. 키 없이도 수동으로 기록하고 수정할 수 있습니다.

## 데이터와 개인정보

단어 기록은 Supabase 데이터베이스에 계정별로 저장되어 다른 기기에서도 같은 계정으로 볼 수 있습니다. 사전 API 키만 현재 브라우저에 저장됩니다. 계정과 데이터베이스를 만들고 설정하는 과정은 운영자가 Supabase에서 한 번 완료해야 합니다.

## 출처

뜻풀이와 예문은 사용자가 입력한 단어를 바탕으로 [국립국어원 한국어기초사전 Open API](https://krdict.korean.go.kr/kor/openApi/openApiInfo)에서 조회합니다. API는 인증키가 필요하며, 공식 안내에서 응답 형식은 XML로 설명하고 있습니다.
