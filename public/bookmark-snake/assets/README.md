# PearSans 문장 아틀라스 PNG 굽기 가이드 (폰트 원본 미포함)

공개 GitHub 저장소에 `.ttf` 원본 폰트 파일을 올리지 않고도 Quest 3S에서 `PearSans-SemiBold` 모양 그대로 렌더링하기 위한 방법입니다.
(`.gitignore`에 `*.ttf`, `*.otf`, `*.woff`, `*.woff2`가 막혀 있어 원본 폰트는 커밋되지 않습니다.)

## 3단계 굽기 방법 (Mac에서 1회)

1. 이 브랜치에서 로컬 서버 실행:
   ```bash
   git fetch origin && git checkout prototype/bookmark-snake-webxr
   npm run dev
   ```
2. 브라우저에서 `http://localhost:5173/bookmark-snake/index.html` 열기
   - 우측 상단 **`PearSans .ttf 불러오기`** 클릭 → `/Users/rafaela/Library/Fonts/PearSans-SemiBold.ttf` 선택 (브라우저 메모리에서만 로드됨)
   - 바로 옆 **`아틀라스 PNG 굽기`** 버튼 클릭 → `sentence-atlas.png` 다운로드
3. 다운받은 이미지를 이 폴더에 넣고 커밋/푸시:
   ```bash
   mv ~/Downloads/sentence-atlas.png public/bookmark-snake/assets/sentence-atlas.png
   git add public/bookmark-snake/assets/sentence-atlas.png
   git commit -m "assets(bookmark-snake): add baked PearSans sentence atlas PNG"
   git push
   ```

이제 Quest 3S와 모든 브라우저가 `assets/sentence-atlas.png`를 최우선 자동 로드합니다.
