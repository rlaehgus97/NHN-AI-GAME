// ============================================
// game.js - 게임의 핵심 로직과 화면 렌더링
//
// 코드 구조:
//   1.  게임 상태 변수
//   2.  유틸리티 함수 (데이터 검색, 랜덤)
//   3.  주문 생성 (generateOrder, makeOrderText)
//   4.  점수 계산 (calculateScore, calculateMoney)
//   5.  SVG 캐릭터 그리기 (renderHair, renderCustomerSVG)
//   6.  화면 렌더링 함수들 (renderTitleScreen, ...)
//   7.  이벤트 핸들러 연결 (attachEventListeners)
//   8.  재료 선택 함수들 (selectBase, selectTopping, ...)
//   9.  제작 단계 진행 (startMixing, packProduct, deliverProduct)
//   10. 게임 흐름 제어 (startGame, goToNextCustomer, restartGame)
//   11. 렌더 함수 (render) + 초기화
//
// 오류 발생 시 확인 순서:
//   1. 브라우저 개발자 도구(F12) > Console 탭에서 오류 메시지 확인
//   2. render() 함수 - 잘못된 currentScreen 값인지 확인
//   3. attachEventListeners() - 이벤트가 중복 등록되지 않았는지 확인
//   4. generateOrder() - order 객체가 올바르게 생성되는지 확인
// ============================================

import {
  CUSTOMERS, PRODUCT_TYPES, SLIME_BASES, WACKPUBOL_BASES,
  TOPPINGS, EXTRA_OPTIONS, SCORE_GRADES,
} from './data.js';

// ================================================
// 1. 게임 상태 변수
//    게임의 모든 정보를 이 객체 하나로 관리합니다
// ================================================
let gameState = createInitialState();

// 초기 게임 상태를 반환하는 함수
// restartGame()에서 이 함수를 호출해 완전히 초기화합니다
function createInitialState() {
  return {
    currentScreen: 'title',  // 현재 화면: title | order | craft | evaluation | results
    customerIndex: 0,         // 현재 손님 번호 (0~4)
    currentOrder: null,       // 현재 손님의 주문 정보
    selection: {              // 플레이어가 선택한 재료
      productType: null,      // 제품 종류 ID
      base: null,             // 베이스 재료 ID
      toppings: [],           // 토핑 ID 배열 (같은 ID 중복 허용)
      extraOption: 'none',    // 추가 옵션 ID
    },
    craftState: 'selecting',  // 제작 단계: selecting → mixing → completed → packed
    results: [],              // 각 손님 결과 배열
    totalMoney: 0,            // 누적 수익
  };
}

// ================================================
// 2. 유틸리티 함수
// ================================================

// ID로 베이스 재료 찾기 (슬라임 + 왁뿌볼 합쳐서 검색)
function getBaseById(id) {
  return [...SLIME_BASES, ...WACKPUBOL_BASES].find(b => b.id === id) || null;
}

// ID로 토핑 찾기
function getToppingById(id) {
  return TOPPINGS.find(t => t.id === id) || null;
}

// 배열에서 무작위 요소 하나 반환
function randomFrom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

// 배열을 섞은 뒤 앞에서 n개 반환
function randomSample(arr, count) {
  return [...arr].sort(() => Math.random() - 0.5).slice(0, count);
}

// 점수에 맞는 등급 정보 반환
function getGradeInfo(score) {
  return SCORE_GRADES.find(g => score >= g.min) || SCORE_GRADES[SCORE_GRADES.length - 1];
}

// ================================================
// 3. 주문 생성
// ================================================

// 무작위 주문을 생성합니다
// 반드시 실제 만들 수 있는 재료 조합으로 생성됩니다
function generateOrder(customer) {
  // 제품 종류 무작위 선택
  const productTypeId = randomFrom(['slime', 'wackpubol']);
  const bases = productTypeId === 'slime' ? SLIME_BASES : WACKPUBOL_BASES;

  // 베이스 무작위 선택
  const base = randomFrom(bases);

  // 토핑 1~3개 무작위 선택
  const toppingCount = Math.floor(Math.random() * 3) + 1;
  const selectedToppings = randomSample(TOPPINGS, toppingCount);

  // 추가 옵션: 70% 없음, 15% 많이, 15% 적게
  const rand = Math.random();
  const extraOption = rand < 0.15 ? 'more' : rand < 0.30 ? 'less' : 'none';

  return {
    productType: productTypeId,
    base: base.id,
    toppings: selectedToppings.map(t => t.id),
    extraOption,
    orderText: makeOrderText(customer, productTypeId, base, selectedToppings, extraOption),
  };
}

// 손님 말투에 맞는 주문 문장을 만들어 반환합니다
function makeOrderText(customer, productTypeId, base, toppings, extraOption) {
  const productName = PRODUCT_TYPES[productTypeId].name;
  const baseName = base.name;

  // 토핑 이름을 한국어 자연스럽게 연결
  const toppingNames = toppings.map(t => t.name);
  let toppingText;
  if (toppingNames.length === 1) {
    toppingText = toppingNames[0];
  } else if (toppingNames.length === 2) {
    toppingText = `${toppingNames[0]}와 ${toppingNames[1]}`;
  } else {
    toppingText = `${toppingNames.slice(0, -1).join(', ')}과 ${toppingNames[toppingNames.length - 1]}`;
  }

  // 추가 옵션 문장
  const extraText =
    extraOption === 'more' ? ' 토핑은 많이 넣어주세요!' :
    extraOption === 'less' ? ' 토핑은 조금만요.' : '';

  // 말투 스타일별 문장
  const styles = {
    polite:  `저기요, ${baseName} ${productName}에 ${toppingText} 토핑 부탁드릴게요.${extraText}`,
    casual:  `${baseName} ${productName} 주세요~ ${toppingText} 넣어서요!${extraText}`,
    cute:    `${baseName} ${productName}에 ${toppingText} 넣어주세요~♪${extraText}`,
    excited: `${baseName} ${productName}에 ${toppingText}!! 빨리요!${extraText} 완전 기대돼요!`,
    shy:     `저... ${baseName} ${productName}에 ${toppingText} 부탁드려도 될까요?${extraText}`,
  };

  return styles[customer.speechStyle] || styles.polite;
}

// ================================================
// 4. 점수 계산
// ================================================

// 주문과 플레이어 선택을 비교해서 0~100점을 계산합니다
function calculateScore(order, selection) {
  let score = 0;
  const breakdown = [];

  // 제품 종류 일치 (20점)
  if (order.productType === selection.productType) {
    score += 20;
    breakdown.push({ label: '제품 종류 일치', points: 20, correct: true });
  } else {
    breakdown.push({ label: '제품 종류 불일치', points: 0, correct: false });
  }

  // 베이스 색상 일치 (30점)
  if (order.base === selection.base) {
    score += 30;
    breakdown.push({ label: '베이스 색상 일치', points: 30, correct: true });
  } else {
    breakdown.push({ label: '베이스 색상 불일치', points: 0, correct: false });
  }

  // 토핑 정확도 (40점)
  // 주문한 토핑이 맞게 포함됐는지, 여분 토핑이 있는지 확인
  const orderedSet  = new Set(order.toppings);
  const selectedSet = new Set(selection.toppings);

  const correctCount = [...orderedSet].filter(t => selectedSet.has(t)).length;
  const extraCount   = [...selectedSet].filter(t => !orderedSet.has(t)).length;

  // 정답 토핑 비율로 40점 계산, 여분 토핑 1개당 5점 감점
  const toppingScore = Math.max(0,
    Math.round((correctCount / order.toppings.length) * 40) - extraCount * 5
  );
  score += toppingScore;

  let toppingLabel;
  if (toppingScore === 40) {
    toppingLabel = '토핑 정확도 완벽';
  } else {
    toppingLabel = `토핑 (정답 ${correctCount}/${order.toppings.length}${extraCount > 0 ? `, 여분 ${extraCount}개 감점` : ''})`;
  }
  breakdown.push({ label: toppingLabel, points: toppingScore, correct: toppingScore >= 20 });

  // 추가 옵션 일치 (10점)
  if (order.extraOption === selection.extraOption) {
    score += 10;
    breakdown.push({ label: '추가 옵션 일치', points: 10, correct: true });
  } else {
    breakdown.push({ label: '추가 옵션 불일치', points: 0, correct: false });
  }

  return { score: Math.min(100, Math.max(0, score)), breakdown };
}

// 점수에 따른 보상 금액 계산
function calculateMoney(score) {
  return Math.round(score * 15 + 200);
}

// ================================================
// 5. SVG 캐릭터 그리기
//    이미지로 교체하려면 renderCustomerSVG 함수에서
//    SVG 태그 대신 <img> 태그를 반환하도록 수정하세요
//    예) return `<img src="${customer.imagePath}" class="customer-svg" />`;
// ================================================

// 머리 스타일별 SVG 경로를 반환합니다
function renderHair(style, color) {
  const c = color;
  switch (style) {
    case 'bob':   // 단발머리
      return `
        <ellipse cx="60" cy="43" rx="44" ry="28" fill="${c}"/>
        <path d="M 20 67 Q 16 105 22 118 L 32 118 Q 27 100 30 76 Z" fill="${c}"/>
        <path d="M 100 67 Q 104 105 98 118 L 88 118 Q 93 100 90 76 Z" fill="${c}"/>
        <rect x="17" y="66" width="86" height="20" rx="5" fill="${c}"/>
      `;
    case 'short': // 짧은 남자 머리
      return `
        <ellipse cx="60" cy="41" rx="44" ry="26" fill="${c}"/>
        <rect x="16" y="51" width="88" height="17" rx="4" fill="${c}"/>
      `;
    case 'twin':  // 양갈래 머리
      return `
        <ellipse cx="60" cy="43" rx="44" ry="27" fill="${c}"/>
        <circle cx="14" cy="75" r="16" fill="${c}"/>
        <circle cx="106" cy="75" r="16" fill="${c}"/>
        <rect x="5" y="60" width="23" height="30" rx="8" fill="${c}"/>
        <rect x="92" y="60" width="23" height="30" rx="8" fill="${c}"/>
      `;
    case 'long':  // 긴 머리
      return `
        <ellipse cx="60" cy="43" rx="44" ry="27" fill="${c}"/>
        <path d="M 18 72 Q 10 135 16 185 L 28 185 Q 23 132 28 82 Z" fill="${c}"/>
        <path d="M 102 72 Q 110 135 104 185 L 92 185 Q 97 132 92 82 Z" fill="${c}"/>
      `;
    case 'curly': // 곱슬머리
      return `
        <ellipse cx="60" cy="43" rx="44" ry="27" fill="${c}"/>
        <circle cx="19" cy="57" r="13" fill="${c}"/>
        <circle cx="101" cy="57" r="13" fill="${c}"/>
        <circle cx="14" cy="40" r="11" fill="${c}"/>
        <circle cx="106" cy="40" r="11" fill="${c}"/>
        <circle cx="28" cy="27" r="10" fill="${c}"/>
        <circle cx="92" cy="27" r="10" fill="${c}"/>
        <circle cx="50" cy="19" r="9" fill="${c}"/>
        <circle cx="70" cy="19" r="9" fill="${c}"/>
      `;
    default:
      return `<ellipse cx="60" cy="43" rx="44" ry="27" fill="${c}"/>`;
  }
}

// 손님 캐릭터를 SVG로 렌더링합니다
// mood: 'happy' | 'neutral' | 'sad'
// ※ 이미지로 교체하려면 이 함수를 수정하세요
function renderCustomerSVG(customer, mood) {
  // 표정에 따른 입 경로
  const mouthPaths = {
    happy:   'M 46 88 Q 60 100 74 88',
    neutral: 'M 48 88 L 72 88',
    sad:     'M 46 96 Q 60 84 74 96',
  };
  const mouth = mouthPaths[mood] || mouthPaths.neutral;

  // 슬픈 표정은 눈이 반쯤 감깁니다
  const eyeL = mood === 'sad'
    ? `<path d="M 41 72 Q 47 67 53 72" stroke="#333" stroke-width="2.5" fill="none"/>`
    : `<circle cx="47" cy="72" r="5.5" fill="#333"/><circle cx="49" cy="70" r="2" fill="white"/>`;
  const eyeR = mood === 'sad'
    ? `<path d="M 67 72 Q 73 67 79 72" stroke="#333" stroke-width="2.5" fill="none"/>`
    : `<circle cx="73" cy="72" r="5.5" fill="#333"/><circle cx="75" cy="70" r="2" fill="white"/>`;

  return `
    <svg class="customer-svg" viewBox="0 0 120 220" xmlns="http://www.w3.org/2000/svg">
      <!-- 몸통 -->
      <rect x="27" y="133" width="66" height="78" rx="14" fill="${customer.clothColor}"/>
      <!-- 왼팔 -->
      <rect x="5" y="137" width="26" height="55" rx="13" fill="${customer.clothColor}"/>
      <!-- 오른팔 -->
      <rect x="89" y="137" width="26" height="55" rx="13" fill="${customer.clothColor}"/>
      <!-- 머리카락 (얼굴 뒤쪽) -->
      ${renderHair(customer.hairStyle, customer.hairColor)}
      <!-- 얼굴 -->
      <circle cx="60" cy="80" r="44" fill="${customer.skinColor}"/>
      <!-- 눈 -->
      ${eyeL}
      ${eyeR}
      <!-- 볼터치 -->
      <circle cx="38" cy="89" r="9" fill="#FFB5C8" opacity="0.35"/>
      <circle cx="82" cy="89" r="9" fill="#FFB5C8" opacity="0.35"/>
      <!-- 입 -->
      <path d="${mouth}" stroke="#555" fill="none" stroke-width="2.5" stroke-linecap="round"/>
    </svg>
  `;
}

// ================================================
// 6. 화면 렌더링 함수들
//    각 함수는 HTML 문자열을 반환합니다
//    render() 함수에서 #app에 주입합니다
// ================================================

function renderTitleScreen() {
  return `
    <div class="screen title-screen">
      <div class="title-deco">🫧 ✨ 🔮</div>
      <h1 class="game-title">왁뿌볼 &amp; 슬라임<br>가게 시뮬레이터</h1>
      <p class="game-subtitle">말랑말랑 반짝반짝 나만의 슬라임 가게를 운영해보세요!</p>

      <button class="btn btn-start" id="btn-start">✨ 영업 시작!</button>

      <div class="how-to-play">
        <h3>🎮 플레이 방법</h3>
        <ol>
          <li>손님이 말풍선으로 주문을 알려줘요</li>
          <li>주문에 맞는 베이스와 토핑을 선택해요</li>
          <li>섞기 → 포장 → 전달 순서로 진행해요</li>
          <li>총 5명의 손님을 응대하면 결과가 나와요</li>
        </ol>
        <p class="tip">💡 주문서를 잘 확인하고 정확하게 만들수록 높은 점수!</p>
      </div>
    </div>
  `;
}

function renderOrderScreen() {
  const customer = CUSTOMERS[gameState.customerIndex];
  const order    = gameState.currentOrder;

  return `
    <div class="screen order-screen">
      <!-- 상단 정보 바 -->
      <div class="order-header">
        <span class="customer-counter">손님 ${gameState.customerIndex + 1} / ${CUSTOMERS.length}</span>
        <span class="money-display">💰 ${gameState.totalMoney.toLocaleString()}원</span>
      </div>

      <!-- 가게 배경 장면 -->
      <div class="shop-scene">
        <div class="shop-wall">
          <div class="shop-sign">🫧 슬라임 가게 🔮</div>
          <div class="shelf">
            <div class="shelf-item">🫧</div>
            <div class="shelf-item">🔮</div>
            <div class="shelf-item">✨</div>
            <div class="shelf-item">🌟</div>
          </div>
        </div>

        <!-- 손님 캐릭터 + 말풍선 -->
        <div class="customer-area">
          <div class="speech-bubble">
            <span class="speech-customer-name">${customer.name}</span>
            <p class="speech-text">"${order.orderText}"</p>
          </div>
          <div class="customer-figure">
            ${renderCustomerSVG(customer, 'happy')}
            <div class="customer-name-tag">${customer.name}</div>
          </div>
        </div>

        <!-- 카운터 -->
        <div class="counter">
          <div class="counter-surface">
            <div class="counter-item">🏷️</div>
            <div class="counter-item">💳</div>
            <div class="counter-item">🧾</div>
          </div>
        </div>
      </div>

      <button class="btn btn-confirm" id="btn-confirm-order">📋 주문 확인하기</button>
    </div>
  `;
}

function renderCraftScreen() {
  const order      = gameState.currentOrder;
  const selection  = gameState.selection;
  const craftState = gameState.craftState;
  const customer   = CUSTOMERS[gameState.customerIndex];

  // selecting 상태에서만 재료 선택 가능
  const canSelect = craftState === 'selecting';

  // 제품 종류에 맞는 베이스 목록
  const bases = selection.productType === 'slime' ? SLIME_BASES : WACKPUBOL_BASES;

  // 현재 선택된 베이스 정보
  const currentBase = selection.base ? getBaseById(selection.base) : null;

  // 믹싱볼 내부 토핑 심볼 HTML
  // 최대 6개까지 볼 안에 고정 위치로 배치
  const toppingPositions = [
    { x: 35, y: 38 }, { x: 62, y: 55 }, { x: 78, y: 33 },
    { x: 48, y: 68 }, { x: 22, y: 58 }, { x: 72, y: 68 },
  ];
  const toppingSymbolsHTML = selection.toppings.slice(0, 6).map((toppingId, i) => {
    const topping = getToppingById(toppingId);
    const pos = toppingPositions[i];
    return `<span class="topping-symbol" style="left:${pos.x}%;top:${pos.y}%;color:${topping.color}">${topping.symbol}</span>`;
  }).join('');

  // 현재 단계 안내 문구
  const stageTexts = {
    selecting:  '① 재료 선택 중...',
    mixing:     '② 섞는 중... 🌀',
    completed:  '③ 완성! 포장해주세요',
    packed:     '④ 포장 완료! 전달 가능',
  };

  // 각 버튼의 활성화 조건
  const canMix     = craftState === 'selecting'  && selection.base !== null;
  const canPack    = craftState === 'completed';
  const canDeliver = craftState === 'packed';
  const canUndo    = craftState === 'selecting'  && selection.toppings.length > 0;
  const canReset   = craftState === 'selecting'  && (selection.base !== null || selection.toppings.length > 0);

  // 주문서 텍스트 구성
  const orderToppingsText = order.toppings.map(id => getToppingById(id).name).join(', ');
  const orderExtraText    = order.extraOption !== 'none'
    ? (order.extraOption === 'more' ? '토핑 많이' : '토핑 적게') : '없음';

  // 선택 요약 텍스트 구성
  const summaryProduct = selection.productType ? `${PRODUCT_TYPES[selection.productType].emoji} ${PRODUCT_TYPES[selection.productType].name}` : '제품 미선택';
  const summaryBase    = currentBase ? `베이스: ${currentBase.name}` : '베이스 미선택';
  const summaryTopping = selection.toppings.length > 0
    ? '토핑: ' + selection.toppings.map(id => getToppingById(id).name).join(', ')
    : '토핑 없음';
  const summaryExtra   = selection.extraOption !== 'none'
    ? (selection.extraOption === 'more' ? '많이' : '적게') : '';

  return `
    <div class="screen craft-screen">
      <!-- 상단: 주문서 + 단계 표시 -->
      <div class="craft-header">
        <div class="order-receipt">
          <h3>📋 주문서</h3>
          <p><strong>손님:</strong> ${customer.name} (${gameState.customerIndex + 1}/${CUSTOMERS.length})</p>
          <p><strong>제품:</strong> ${PRODUCT_TYPES[order.productType].emoji} ${PRODUCT_TYPES[order.productType].name}</p>
          <p><strong>베이스:</strong> ${getBaseById(order.base).name}</p>
          <p><strong>토핑:</strong> ${orderToppingsText}</p>
          <p><strong>옵션:</strong> ${orderExtraText}</p>
        </div>
        <div class="craft-stage">
          <div class="stage-indicator">${stageTexts[craftState]}</div>
          <div id="stage-message" class="stage-message"></div>
        </div>
      </div>

      <!-- 재료 선택 영역 -->
      <div class="ingredients-area ${!canSelect ? 'disabled' : ''}">

        <!-- 제품 종류 -->
        <div class="ingredient-group">
          <label class="group-label">🎯 제품 종류</label>
          <div class="ingredient-row">
            ${Object.values(PRODUCT_TYPES).map(pt => `
              <button
                class="ingredient-btn product-btn ${selection.productType === pt.id ? 'selected' : ''}"
                data-action="select-product"
                data-value="${pt.id}"
                ${!canSelect ? 'disabled' : ''}
              >${pt.emoji} ${pt.name}</button>
            `).join('')}
          </div>
        </div>

        <!-- 베이스 재료 (제품 종류 선택 후 표시) -->
        ${selection.productType ? `
        <div class="ingredient-group">
          <label class="group-label">🫙 베이스 색상 (1개만 선택)</label>
          <div class="ingredient-row">
            ${bases.map(base => `
              <button
                class="ingredient-btn base-btn ${selection.base === base.id ? 'selected' : ''}"
                style="--base-color:${base.color}; --base-border:${base.borderColor}"
                data-action="select-base"
                data-value="${base.id}"
                ${!canSelect ? 'disabled' : ''}
              >
                <span class="base-circle"></span>${base.name}
              </button>
            `).join('')}
          </div>
        </div>
        ` : `
        <div class="ingredient-group">
          <p class="hint-text">⬆️ 먼저 제품 종류를 선택하세요</p>
        </div>
        `}

        <!-- 토핑 선택 (베이스 선택 후 표시) -->
        ${selection.productType ? `
        <div class="ingredient-group">
          <label class="group-label">🌟 토핑 (여러 개 가능)</label>
          <div class="ingredient-row">
            ${TOPPINGS.map(topping => {
              const isSelected = selection.toppings.includes(topping.id);
              const count = selection.toppings.filter(t => t === topping.id).length;
              return `
                <button
                  class="ingredient-btn topping-btn ${isSelected ? 'selected' : ''}"
                  data-action="select-topping"
                  data-value="${topping.id}"
                  ${!canSelect ? 'disabled' : ''}
                >
                  <span class="topping-symbol-btn" style="color:${topping.color}">${topping.symbol}</span>
                  ${topping.name}
                  ${count > 0 ? `<span class="count-badge">×${count}</span>` : ''}
                </button>
              `;
            }).join('')}
          </div>
        </div>

        <!-- 추가 옵션 -->
        <div class="ingredient-group">
          <label class="group-label">⚙️ 추가 옵션</label>
          <div class="ingredient-row">
            ${EXTRA_OPTIONS.map(opt => `
              <button
                class="ingredient-btn option-btn ${selection.extraOption === opt.id ? 'selected' : ''}"
                data-action="select-option"
                data-value="${opt.id}"
                ${!canSelect ? 'disabled' : ''}
              >${opt.name}</button>
            `).join('')}
          </div>
        </div>
        ` : ''}
      </div>

      <!-- 현재 선택 요약 -->
      <div class="selection-summary">
        <span>${summaryProduct}</span>
        <span>${summaryBase}</span>
        <span>${summaryTopping}</span>
        ${summaryExtra ? `<span>${summaryExtra}</span>` : ''}
      </div>

      <!-- 믹싱 볼 -->
      <div class="bowl-area">
        <div
          class="mixing-bowl ${craftState === 'mixing' ? 'mixing' : ''} ${craftState === 'packed' ? 'packed' : ''}"
          id="mixing-bowl"
          style="background: ${currentBase ? currentBase.color + 'BB' : 'rgba(240,235,255,0.4)'}"
        >
          ${craftState === 'packed'
            ? `<div class="packed-product">
                 <span class="bag-icon">🛍️</span>
                 <span class="packed-label">${selection.productType ? PRODUCT_TYPES[selection.productType].name : ''}<br>포장 완료!</span>
               </div>`
            : currentBase
            ? `<div class="bowl-contents">${toppingSymbolsHTML}</div>`
            : `<p class="bowl-empty">재료를 선택하세요</p>`
          }
        </div>
        <p class="bowl-label">믹싱 볼</p>
      </div>

      <!-- 액션 버튼들 -->
      <div class="action-buttons">
        <button class="btn btn-undo"    id="btn-undo"    ${!canUndo    ? 'disabled' : ''}>↩️ 취소</button>
        <button class="btn btn-reset"   id="btn-reset"   ${!canReset   ? 'disabled' : ''}>🗑️ 초기화</button>
        <button class="btn btn-mix"     id="btn-mix"     ${!canMix     ? 'disabled' : ''}>🌀 섞기</button>
        <button class="btn btn-pack"    id="btn-pack"    ${!canPack    ? 'disabled' : ''}>🛍️ 포장</button>
        <button class="btn btn-deliver" id="btn-deliver" ${!canDeliver ? 'disabled' : ''}>🚀 전달하기</button>
      </div>
    </div>
  `;
}

function renderEvaluationScreen() {
  const lastResult = gameState.results[gameState.results.length - 1];
  const customer   = CUSTOMERS[gameState.customerIndex];
  const grade      = getGradeInfo(lastResult.score);
  const order      = lastResult.order;
  const selection  = lastResult.selection;

  // 점수에 따른 손님 표정
  const mood = lastResult.score >= 70 ? 'happy' : lastResult.score >= 50 ? 'neutral' : 'sad';
  const isLastCustomer = gameState.customerIndex >= CUSTOMERS.length - 1;

  // 주문 vs 실제 내용
  const orderBase    = getBaseById(order.base);
  const selectedBase = selection.base ? getBaseById(selection.base) : null;

  return `
    <div class="screen evaluation-screen" style="background: ${grade.bgColor}">
      <div class="eval-header">
        <h2>제품 전달 완료!</h2>
        <div class="grade-badge">${grade.moodEmoji} ${grade.label}</div>
      </div>

      <div class="eval-content">
        <!-- 손님 캐릭터 -->
        <div class="eval-customer">
          ${renderCustomerSVG(customer, mood)}
          <div class="customer-name-tag">${customer.name}</div>
        </div>

        <!-- 점수 상세 -->
        <div class="eval-details">
          <div class="score-display">
            <span class="score-number">${lastResult.score}</span>
            <span class="score-unit">점</span>
          </div>
          <div class="money-earned">+${lastResult.money.toLocaleString()}원 획득!</div>

          <!-- 항목별 점수 내역 -->
          <div class="score-breakdown">
            ${lastResult.breakdown.map(item => `
              <div class="breakdown-item ${item.correct ? 'correct' : 'incorrect'}">
                <span>${item.correct ? '✅' : '❌'} ${item.label}</span>
                <span>${item.points}점</span>
              </div>
            `).join('')}
          </div>

          <!-- 주문 vs 실제 비교 -->
          <div class="order-comparison">
            <div class="comparison-col">
              <h4>📋 주문 내용</h4>
              <p>${PRODUCT_TYPES[order.productType].name}</p>
              <p>${orderBase ? orderBase.name + ' 베이스' : '-'}</p>
              <p>${order.toppings.map(id => getToppingById(id).name).join(', ')}</p>
              <p>${order.extraOption !== 'none' ? (order.extraOption === 'more' ? '토핑 많이' : '토핑 적게') : '기본'}</p>
            </div>
            <div class="comparison-col">
              <h4>🫙 만든 내용</h4>
              <p>${selection.productType ? PRODUCT_TYPES[selection.productType].name : '미선택'}</p>
              <p>${selectedBase ? selectedBase.name + ' 베이스' : '미선택'}</p>
              <p>${selection.toppings.length > 0 ? selection.toppings.map(id => getToppingById(id).name).join(', ') : '없음'}</p>
              <p>${selection.extraOption !== 'none' ? (selection.extraOption === 'more' ? '토핑 많이' : '토핑 적게') : '기본'}</p>
            </div>
          </div>
        </div>
      </div>

      <button class="btn btn-next" id="btn-next">
        ${isLastCustomer ? '📊 최종 결과 보기' : '👋 다음 손님'}
      </button>
    </div>
  `;
}

function renderResultsScreen() {
  const results   = gameState.results;
  const avgScore  = Math.round(results.reduce((sum, r) => sum + r.score, 0) / results.length);
  const maxScore  = Math.max(...results.map(r => r.score));
  const finalGrade = getGradeInfo(avgScore);

  // 평균 점수에 따른 총평 문구
  const comment =
    avgScore >= 90 ? '완벽한 가게 운영! 별 5개 만점이에요! ⭐⭐⭐⭐⭐' :
    avgScore >= 70 ? '훌륭해요! 손님들이 아주 만족했어요! 🌟' :
    avgScore >= 50 ? '조금 더 연습하면 완벽한 가게가 될 거예요! 💪' :
    '아직 연습이 필요해요. 다시 도전해봐요! 🔥';

  return `
    <div class="screen results-screen">
      <h2 class="results-title">📊 영업 결과</h2>

      <!-- 주요 수치 요약 -->
      <div class="results-summary">
        <div class="result-stat">
          <span class="stat-label">응대한 손님</span>
          <span class="stat-value">${results.length}명</span>
        </div>
        <div class="result-stat">
          <span class="stat-label">평균 정확도</span>
          <span class="stat-value">${avgScore}점</span>
        </div>
        <div class="result-stat">
          <span class="stat-label">최고 점수</span>
          <span class="stat-value">${maxScore}점</span>
        </div>
        <div class="result-stat highlight">
          <span class="stat-label">총 수익</span>
          <span class="stat-value">💰 ${gameState.totalMoney.toLocaleString()}원</span>
        </div>
      </div>

      <!-- 손님별 점수 바 차트 -->
      <div class="customer-scores">
        ${results.map((result, i) => {
          const g = getGradeInfo(result.score);
          return `
            <div class="customer-score-item">
              <span>${CUSTOMERS[i].name}</span>
              <span>${g.moodEmoji}</span>
              <div class="score-bar-bg">
                <div class="score-bar-fill" data-target="${result.score}"></div>
              </div>
              <span>${result.score}점</span>
            </div>
          `;
        }).join('')}
      </div>

      <!-- 총평 -->
      <div class="overall-grade">
        <div class="grade-emoji">${finalGrade.moodEmoji}</div>
        <p class="overall-comment">${comment}</p>
      </div>

      <button class="btn btn-restart" id="btn-restart">🔄 다시 시작</button>
    </div>
  `;
}

// ================================================
// 7. 이벤트 핸들러 연결
//    화면이 렌더링된 후에 호출됩니다
// ================================================
function attachEventListeners() {
  // 타이틀 화면 버튼
  document.getElementById('btn-start')?.addEventListener('click', startGame);

  // 주문 화면 버튼
  document.getElementById('btn-confirm-order')?.addEventListener('click', goToCraftScreen);

  // 제작 화면: 이벤트 위임으로 모든 클릭 처리
  const craftScreen = document.querySelector('.craft-screen');
  if (craftScreen) {
    craftScreen.addEventListener('click', handleCraftClick);
  }

  // 평가 화면 버튼
  document.getElementById('btn-next')?.addEventListener('click', goToNextCustomer);

  // 결과 화면 버튼
  document.getElementById('btn-restart')?.addEventListener('click', restartGame);
}

// 제작 화면의 모든 클릭을 처리합니다 (이벤트 위임 방식)
function handleCraftClick(event) {
  // 비활성화된 버튼은 무시
  const btn = event.target.closest('button');
  if (!btn || btn.disabled) return;

  // data-action이 있는 재료 선택 버튼 처리
  const action = btn.dataset.action;
  if (action) {
    const value = btn.dataset.value;
    // 섞기가 시작된 이후에는 재료를 변경할 수 없습니다
    if (gameState.craftState !== 'selecting') {
      showMessage('이미 섞기가 시작되어 재료를 변경할 수 없어요!');
      return;
    }
    switch (action) {
      case 'select-product': selectProductType(value); break;
      case 'select-base':    selectBase(value);        break;
      case 'select-topping': selectTopping(value);     break;
      case 'select-option':  selectOption(value);      break;
    }
    return;
  }

  // 액션 버튼 ID로 처리
  switch (btn.id) {
    case 'btn-undo':    undoLastTopping(); break;
    case 'btn-reset':   resetSelection();  break;
    case 'btn-mix':     startMixing();     break;
    case 'btn-pack':    packProduct();     break;
    case 'btn-deliver': deliverProduct();  break;
  }
}

// ================================================
// 8. 재료 선택 함수들
// ================================================

// 제품 종류 선택 (변경 시 베이스 초기화)
function selectProductType(productTypeId) {
  if (gameState.selection.productType !== productTypeId) {
    gameState.selection.base = null;
  }
  gameState.selection.productType = productTypeId;
  render();
}

// 베이스 선택 (1개만 가능 - 덮어쓰기)
function selectBase(baseId) {
  if (!gameState.selection.productType) {
    showMessage('먼저 제품 종류를 선택해주세요!');
    return;
  }
  gameState.selection.base = baseId;
  render();
}

// 토핑 선택 (여러 개, 중복 가능)
function selectTopping(toppingId) {
  if (!gameState.selection.base) {
    showMessage('먼저 베이스를 선택해주세요!');
    return;
  }
  gameState.selection.toppings.push(toppingId);
  render();
}

// 추가 옵션 선택
function selectOption(optionId) {
  gameState.selection.extraOption = optionId;
  render();
}

// 마지막에 추가한 토핑 하나 취소
function undoLastTopping() {
  if (gameState.craftState !== 'selecting') {
    showMessage('섞기 전에만 취소할 수 있어요!');
    return;
  }
  gameState.selection.toppings.pop();
  render();
}

// 베이스와 토핑 전체 초기화
function resetSelection() {
  if (gameState.craftState !== 'selecting') {
    showMessage('섞기 전에만 초기화할 수 있어요!');
    return;
  }
  gameState.selection.base = null;
  gameState.selection.toppings = [];
  gameState.selection.extraOption = 'none';
  render();
}

// ================================================
// 9. 제작 단계 진행 함수들
// ================================================

// 섞기 버튼: selecting → mixing → (1.2초 후) completed
function startMixing() {
  if (!gameState.selection.base) {
    showMessage('베이스를 선택해야 섞을 수 있어요!');
    return;
  }
  if (gameState.craftState !== 'selecting') return;

  gameState.craftState = 'mixing';
  render(); // 믹싱 애니메이션 표시

  // 1.2초 후 완성 상태로 변경
  setTimeout(() => {
    gameState.craftState = 'completed';
    render();
  }, 1200);
}

// 포장 버튼: completed → packed
function packProduct() {
  if (gameState.craftState !== 'completed') {
    showMessage('먼저 재료를 섞어야 해요!');
    return;
  }
  gameState.craftState = 'packed';
  render();
}

// 전달 버튼: 점수 계산 후 평가 화면으로 이동
function deliverProduct() {
  if (gameState.craftState !== 'packed') {
    showMessage('먼저 포장을 완료해야 해요!');
    return;
  }

  // 점수 계산
  const { score, breakdown } = calculateScore(gameState.currentOrder, gameState.selection);
  const money = calculateMoney(score);

  // 결과 기록 (나중에 비교할 수 있도록 깊은 복사)
  gameState.results.push({
    score,
    breakdown,
    money,
    order: {
      ...gameState.currentOrder,
      toppings: [...gameState.currentOrder.toppings],
    },
    selection: {
      productType: gameState.selection.productType,
      base:        gameState.selection.base,
      toppings:    [...gameState.selection.toppings],
      extraOption: gameState.selection.extraOption,
    },
  });

  gameState.totalMoney += money;
  gameState.currentScreen = 'evaluation';
  render();
}

// ================================================
// 10. 게임 흐름 제어
// ================================================

// 게임 시작: 타이틀 → 첫 번째 손님 주문 화면
function startGame() {
  gameState.customerIndex = 0;
  gameState.results       = [];
  gameState.totalMoney    = 0;
  prepareNextCustomer();
  gameState.currentScreen = 'order';
  render();
}

// 다음 손님을 위해 주문 생성 + 선택 초기화
function prepareNextCustomer() {
  const customer = CUSTOMERS[gameState.customerIndex];
  gameState.currentOrder = generateOrder(customer);

  // 주문에 맞는 제품 종류를 자동으로 선택 (힌트 제공)
  gameState.selection = {
    productType: gameState.currentOrder.productType,
    base:        null,
    toppings:    [],
    extraOption: 'none',
  };
  gameState.craftState = 'selecting';
}

// 주문 확인 → 제작 화면으로 이동
function goToCraftScreen() {
  gameState.currentScreen = 'craft';
  render();
}

// 평가 화면에서 다음 손님 또는 결과 화면으로
function goToNextCustomer() {
  const isLastCustomer = gameState.customerIndex >= CUSTOMERS.length - 1;

  if (isLastCustomer) {
    gameState.currentScreen = 'results';
    render();
  } else {
    gameState.customerIndex++;
    prepareNextCustomer();
    gameState.currentScreen = 'order';
    render();
  }
}

// 게임 완전 초기화 후 타이틀 화면으로
function restartGame() {
  gameState = createInitialState();
  render();
}

// ================================================
// UI 유틸리티
// ================================================

// 제작 화면에서 안내 메시지를 잠깐 표시합니다
function showMessage(text) {
  const msgEl = document.getElementById('stage-message');
  if (!msgEl) return;
  msgEl.textContent = text;
  msgEl.style.opacity = '1';
  setTimeout(() => { msgEl.style.opacity = '0'; }, 2200);
}

// 결과 화면에서 점수 바를 애니메이션으로 채웁니다
function animateScoreBars() {
  document.querySelectorAll('.score-bar-fill[data-target]').forEach(bar => {
    const target = bar.dataset.target;
    // CSS transition을 트리거하기 위해 잠깐 기다린 후 너비 설정
    requestAnimationFrame(() => {
      bar.style.width = target + '%';
    });
  });
}

// ================================================
// 11. 메인 렌더 함수
//     현재 게임 상태에 맞는 화면을 #app에 그립니다
// ================================================
function render() {
  const app = document.getElementById('app');
  if (!app) {
    console.error('오류: #app 요소를 찾을 수 없습니다. index.html을 확인하세요.');
    return;
  }

  switch (gameState.currentScreen) {
    case 'title':
      app.innerHTML = renderTitleScreen();
      break;
    case 'order':
      app.innerHTML = renderOrderScreen();
      break;
    case 'craft':
      app.innerHTML = renderCraftScreen();
      break;
    case 'evaluation':
      app.innerHTML = renderEvaluationScreen();
      break;
    case 'results':
      app.innerHTML = renderResultsScreen();
      // 렌더링 후 점수 바 애니메이션 실행
      setTimeout(animateScoreBars, 80);
      break;
    default:
      app.innerHTML = `<div class="screen"><p>알 수 없는 화면: ${gameState.currentScreen}</p></div>`;
  }

  // 화면 렌더링 후 이벤트 핸들러 연결
  attachEventListeners();
}

// ================================================
// 게임 시작: DOM이 준비되면 타이틀 화면을 표시합니다
// ================================================
document.addEventListener('DOMContentLoaded', () => {
  render();
});
