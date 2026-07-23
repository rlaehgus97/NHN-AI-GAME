// ============================================
// data.js - 게임에 사용되는 모든 데이터 정의
//
// 손님 추가/수정: CUSTOMERS 배열을 수정하세요
// 재료 추가/수정: SLIME_BASES, WACKPUBOL_BASES, TOPPINGS를 수정하세요
// 나중에 이미지 교체: 각 항목에 imagePath 속성을 추가하세요
//   예) { id: 'slime_pink', name: '분홍색', imagePath: './images/pink_base.png', ... }
// ============================================

// 손님 데이터 (5명)
// imagePath를 추가하면 SVG 대신 이미지를 사용할 수 있습니다
export const CUSTOMERS = [
  {
    id: 'c1',
    name: '소연',
    skinColor: '#FFD5B3',   // 피부색
    hairColor: '#3D1F00',   // 머리색
    hairStyle: 'bob',       // 머리 모양: bob(단발), short(짧은), twin(양갈래), long(긴), curly(곱슬)
    clothColor: '#FF8FAB',  // 옷 색상
    speechStyle: 'polite',  // 말투: polite(정중), casual(캐주얼), cute(귀여운), excited(들뜬), shy(수줍은)
    // imagePath: './images/customer_soyeon.png',  // 나중에 이미지로 교체할 때 추가
  },
  {
    id: 'c2',
    name: '민준',
    skinColor: '#C68642',
    hairColor: '#1A1008',
    hairStyle: 'short',
    clothColor: '#7B9EFF',
    speechStyle: 'casual',
  },
  {
    id: 'c3',
    name: '하루',
    skinColor: '#FDDBB4',
    hairColor: '#C9A040',
    hairStyle: 'twin',
    clothColor: '#98D8C8',
    speechStyle: 'cute',
  },
  {
    id: 'c4',
    name: '지호',
    skinColor: '#D4956A',
    hairColor: '#2D1B00',
    hairStyle: 'long',
    clothColor: '#FFD166',
    speechStyle: 'excited',
  },
  {
    id: 'c5',
    name: '수아',
    skinColor: '#F1C27D',
    hairColor: '#6B3FA0',
    hairStyle: 'curly',
    clothColor: '#D4A5FF',
    speechStyle: 'shy',
  },
];

// 제품 종류
export const PRODUCT_TYPES = {
  slime:     { id: 'slime',     name: '슬라임', emoji: '🫧' },
  wackpubol: { id: 'wackpubol', name: '왁뿌볼', emoji: '🔮' },
};

// 슬라임 베이스 재료
// 나중에 이미지로 교체하려면 imagePath를 추가하세요
export const SLIME_BASES = [
  { id: 'slime_pink',   name: '분홍색', color: '#FFB7C5', borderColor: '#FF8FAB' },
  { id: 'slime_sky',    name: '하늘색', color: '#87CEEB', borderColor: '#5BB8E8' },
  { id: 'slime_purple', name: '보라색', color: '#C8A2C8', borderColor: '#9B6B9B' },
];

// 왁뿌볼 베이스 재료
export const WACKPUBOL_BASES = [
  { id: 'wack_white',  name: '흰색',   color: '#F0F0F0', borderColor: '#CCCCCC' },
  { id: 'wack_yellow', name: '노란색', color: '#FFE566', borderColor: '#FFD700' },
  { id: 'wack_mint',   name: '민트색', color: '#AEFFD8', borderColor: '#6EDCAA' },
];

// 공통 토핑
// symbol: 믹싱볼 안에 표시되는 기호 (이미지로 교체 가능)
export const TOPPINGS = [
  { id: 'star',    name: '별',     emoji: '⭐', symbol: '★', color: '#FFD700' },
  { id: 'heart',   name: '하트',   emoji: '💗', symbol: '♥', color: '#FF6B8A' },
  { id: 'pearl',   name: '진주',   emoji: '⚪', symbol: '●', color: '#C0B8D0' },
  { id: 'marble',  name: '구슬',   emoji: '🔵', symbol: '◉', color: '#6EB5FF' },
  { id: 'glitter', name: '반짝이', emoji: '✨', symbol: '✦', color: '#FFC845' },
];

// 추가 옵션
export const EXTRA_OPTIONS = [
  { id: 'more', name: '토핑 많이' },
  { id: 'less', name: '토핑 적게' },
  { id: 'none', name: '기본' },
];

// 점수 등급 정보
// min 점수 이상이면 해당 등급이 적용됩니다
export const SCORE_GRADES = [
  { min: 90, label: '완벽해요!',              face: 'happy',   moodEmoji: '🌟', bgColor: '#FFF9E0' },
  { min: 70, label: '꽤 마음에 들어요!',      face: 'happy',   moodEmoji: '😊', bgColor: '#E8F5E9' },
  { min: 50, label: '주문과 조금 다른 것 같아요.', face: 'neutral', moodEmoji: '😐', bgColor: '#FFF3E0' },
  { min: 0,  label: '제가 주문한 제품이 아니에요.', face: 'sad', moodEmoji: '😢', bgColor: '#FFEBEE' },
];
