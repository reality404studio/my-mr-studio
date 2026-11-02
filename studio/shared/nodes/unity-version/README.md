# 결정: Unity 6 vs 2022

**추천: Unity 6.** 코드는 에이전트가 짜니 "2022 레퍼런스가 많다"는 장점이 줄고,
Meta의 최신 SDK와 에이전트 도구는 Unity 6 기준이에요.

| 기준 | Unity 2022.3 | Unity 6 |
| --- | --- | --- |
| Meta XR SDK | v85까지 (최소 2022.3.15f1) | 최신 v205는 최소 6000.0.66f2 |
| 패스스루 카메라 API 샘플 | 구버전만 | 6000.0.38f1 이상 |
| Unity 공식 MCP (에이전트가 에디터 조작) | 불가 | Unity 6 + Unity AI 구독 좌석 |
| Meta XR Unity MCP Extension | 불가 | 가능 |
| 커뮤니티 MCP | MCP Unity(CoderGamester) 2021.3+ | 가능 |

2022에 머물러도 필요한 기능(패스스루, 핸드트래킹, 깊이 가림, 공간 앵커)은 v85 SDK로 충분해요.
대신 Meta 공식 에이전트 도구를 온전히 못 쓰고, 에이전트는 C# 파일을 직접 고치는 방식으로 일해요.

## 결정

- [ ] Unity 6으로 이전
- [ ] 2022 유지

결정하면 이 단계를 `done` 으로 바꾸고, 위에 체크해 주세요. 캘리브레이션과 구현 단계가 이걸 기다려요.

출처: Meta XR All-in-One SDK 페이지 (v85, v205), Unity AI MCP 오픈 베타 공지, Passthrough Camera API 샘플 README (2026-11-02 확인)
