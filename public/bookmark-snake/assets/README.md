# PearSans Font Drop-In (Quest 3S용)

Mac 데스크톱 브라우저에서는 시스템에 설치된 `PearSans`가 자동으로 적용되지만,
Meta Quest 3S(Android) 브라우저에는 해당 폰트가 내장되어 있지 않습니다.

Quest 3S에서도 `PearSans-SemiBold`로 렌더링하려면 Mac에서 아래 명령으로 폰트 파일을 복사해 두세요:

```bash
cp /Users/rafaela/Library/Fonts/PearSans-SemiBold.ttf public/bookmark-snake/assets/PearSans-SemiBold.ttf
```

`text-atlas.js`가 `./assets/PearSans-SemiBold.ttf`를 자동으로 최우선 로드합니다.
