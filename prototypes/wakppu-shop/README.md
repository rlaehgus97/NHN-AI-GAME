# 왁뿌볼 & 슬라임 가게 시뮬레이터

말랑말랑 반짝반짝 나만의 슬라임 가게를 운영하는 2D 웹 게임 데모입니다.

## 실행 방법

브라우저에서 바로 플레이할 수 있습니다.  
미리보기 창의 URL을 열거나, 개발 서버를 실행하세요.

---

## 파일 구조와 역할

```
src/
├── main.js          - 게임 시작점 (style.css와 game.js를 불러옵니다)
├── style.css        - 게임 전체 스타일 (레이아웃, 색상, 애니메이션)
└── js/
    ├── data.js      - 게임 데이터 (손님, 재료, 점수 등급)
    └── game.js      - 게임 로직 + 화면 렌더링 (핵심 파일)

index.html           - HTML 진입점 (#app 컨테이너)
README.md            - 이 파일
```

---

## 구현된 기능

- ✅ 타이틀 화면 (게임 설명, 플레이 방법)
- ✅ 주문 화면 (5명 손님, SVG 캐릭터, 말풍선, 가게 배경)
- ✅ 제작 화면 (재료 선택, 믹싱볼, 섞기 애니메이션, 포장)
- ✅ 평가 화면 (점수 계산, 항목별 내역, 주문 비교)
- ✅ 결과 화면 (손님별 점수 바, 총수익, 다시 시작)
- ✅ 반응형 레이아웃 (모바일/태블릿 대응)

---

## 아직 단순하게 구현된 부분

- **손님 캐릭터**: 외부 이미지 없이 SVG로 구현. 나중에 이미지로 교체 가능
- **재료 표시**: CSS 도형과 이모지 기호 사용. 나중에 이미지로 교체 가능
- **배경**: CSS 그라디언트와 이모지 사용. 나중에 픽셀 아트 배경으로 교체 가능
- **점수 바 애니메이션**: 결과 화면에서 0%에서 채워지는 간단한 애니메이션

---

## 이미지로 교체하는 방법

### 손님 캐릭터 교체
`src/js/game.js`의 `renderCustomerSVG` 함수를 수정하세요.

```js
// 현재 SVG 방식 대신 이미지를 반환하도록 변경
function renderCustomerSVG(customer, mood) {
  // customer.imagePath가 있으면 이미지 사용
  if (customer.imagePath) {
    return `<img src="${customer.imagePath}" class="customer-svg" alt="${customer.name}"/>`;
  }
  // 없으면 기존 SVG 사용...
}
```

그리고 `src/js/data.js`의 CUSTOMERS 배열에 imagePath를 추가하세요:
```js
{ id: 'c1', name: '소연', imagePath: './images/soyeon.png', ... }
```

### 재료 이미지 교체
`src/js/data.js`의 각 재료에 imagePath를 추가하고,  
`src/js/game.js`의 믹싱볼 토핑 렌더링 부분에서 symbol 대신 이미지를 사용하도록 수정하세요.

---

## 오류 발생 시 확인 위치

1. **브라우저 개발자 도구 (F12) > Console 탭**에서 빨간 오류 메시지 확인
2. **화면이 안 나타날 때**: `render()` 함수, `#app` 요소 존재 여부 확인
3. **버튼이 동작하지 않을 때**: `attachEventListeners()`, `handleCraftClick()` 확인
4. **주문이 이상할 때**: `generateOrder()`, `makeOrderText()` 확인
5. **점수가 이상할 때**: `calculateScore()` 함수 확인
