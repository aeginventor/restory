import type { Archive, Entry, PublicEntry, Work } from "./types";

export const DEMO_USER_ID = "00000000-0000-4000-8000-000000000001";
const createdAt = "2026-09-28T08:00:00.000Z";
const work = (
  number: number,
  title: string,
  mediaType: Work["mediaType"],
  creator: string,
  releaseYear: number,
): Work => ({
  id: `10000000-0000-4000-8000-${String(number).padStart(12, "0")}`,
  title,
  mediaType,
  creator,
  releaseYear,
  ownerId: DEMO_USER_ID,
  isPublic: false,
  createdAt,
});
const works: Work[] = [
  work(1, "퍼펙트 데이즈", "film", "빔 벤더스", 2023),
  work(2, "지구 끝의 온실", "book", "김초엽", 2021),
  work(3, "괴물", "film", "고레에다 히로카즈", 2023),
  work(4, "Outer Wilds", "game", "Mobius Digital", 2019),
  work(5, "장송의 프리렌", "animation", "매드하우스", 2023),
  work(6, "애프터썬", "film", "샬럿 웰스", 2022),
];
const entry = (
  number: number,
  workIndex: number,
  experiencedOn: string | null,
  datePrecision: Entry["datePrecision"],
  summary: string,
  body: string,
  tags: string[],
  favorite = false,
): Entry => ({
  id: `20000000-0000-4000-8000-${String(number).padStart(12, "0")}`,
  workId: works[workIndex].id,
  userId: DEMO_USER_ID,
  experiencedOn,
  datePrecision,
  summary,
  body: `[체험용으로 작성한 가상의 감상입니다.]\n\n${body}`,
  tags,
  favorite,
  visibility: "private",
  spoiler: false,
  createdAt,
  updatedAt: createdAt,
});
const entries: Entry[] = [
  entry(
    1,
    0,
    "2026-09-27",
    "day",
    "같은 하루도 매번 조금씩 달랐다.",
    "걷는 길과 음악, 나뭇잎을 보는 시간이 오래 남았다. 다음에 다시 보면 오늘과는 다른 장면에 눈이 갈 것 같다.",
    ["여운", "일상"],
    true,
  ),
  entry(
    2,
    1,
    "2026-09",
    "month",
    "누군가 돌본 것이 시간을 건너 남는다는 것.",
    "읽은 날짜는 정확히 기억나지 않는다. 서로 만나지 못한 사람들이 이어지는 방식을 다시 읽고 싶다.",
    ["연결", "희망"],
    true,
  ),
  entry(
    3,
    2,
    "2026-08-14",
    "day",
    "다시 보니 처음에 놓쳤던 표정이 보였다.",
    "첫 감상 때의 메모를 읽고 다시 보았다. 이번에는 말하지 못하는 사람들의 머뭇거림이 더 마음에 남았다.",
    ["재감상", "여운"],
    true,
  ),
  entry(
    4,
    3,
    "2026",
    "year",
    "모르는 곳에 한 번 더 가 보고 싶어졌다.",
    "천천히 알아 가는 시간이 좋았다. 다음에 돌아볼 때도 구체적인 장면보다 그때의 호기심을 기억하고 싶다.",
    ["호기심"],
    false,
  ),
  entry(
    5,
    2,
    "2025-11-08",
    "day",
    "끝나고 한동안 자리에서 일어나지 못했다.",
    "처음 남기는 감상. 시간이 지난 뒤 생각이 어떻게 달라질지 궁금하다.",
    ["혼란", "여운"],
    false,
  ),
  entry(
    6,
    4,
    "2025-04",
    "month",
    "뒤늦게 알게 되는 마음에 관하여.",
    "함께 보낸 시간이 나중에야 다르게 느껴질 수 있다는 생각을 했다.",
    ["시간", "따뜻함"],
    false,
  ),
  entry(
    7,
    5,
    null,
    "unknown",
    "날짜는 잊었지만 마지막의 느낌은 남아 있다.",
    "언제 봤는지 몰라서 기록을 미뤘다. 기억하는 만큼만 적어 두기로 했다.",
    ["기억"],
    false,
  ),
];

export function createSeedArchive(): Archive {
  return structuredClone({
    works,
    entries,
    profile: { id: DEMO_USER_ID, nickname: "체험 사용자" },
  });
}

export function createPublicSamples(): PublicEntry[] {
  return [
    {
      ...entries[0],
      id: "30000000-0000-4000-8000-000000000001",
      userId: "40000000-0000-4000-8000-000000000001",
      visibility: "public",
      authorName: "가상 사용자 소연",
      summary: "반복되는 장면을 보며 마음이 차분해졌다.",
      body: "실제 사용자의 글이 아닌 공개 감상 화면의 체험용 예시입니다.\n\n영화를 본 다음 날, 평소에 지나치던 길의 나무를 한 번 더 보았다.",
      work: { ...works[0], ownerId: null, isPublic: true },
    },
    {
      ...entries[2],
      id: "30000000-0000-4000-8000-000000000002",
      userId: "40000000-0000-4000-8000-000000000002",
      visibility: "public",
      spoiler: true,
      authorName: "가상 사용자 준",
      summary: "두 번째 보았을 때의 감상",
      body: "실제 사용자의 글이 아닌 스포일러 표시의 체험용 예시입니다.\n\n다시 보니 앞부분의 대화가 전과는 다르게 들렸다. 같은 장면을 보고도 처음과 다른 감상을 남겼다.",
      work: { ...works[2], ownerId: null, isPublic: true },
    },
    {
      ...entries[1],
      id: "30000000-0000-4000-8000-000000000003",
      userId: "40000000-0000-4000-8000-000000000003",
      visibility: "public",
      authorName: "가상 사용자 나무",
      summary: "이야기를 다 읽고 앞부분으로 돌아갔다.",
      body: "실제 사용자의 글이 아닌 공개 감상 화면의 체험용 예시입니다.\n\n처음에는 스쳐 읽었던 이름들을 마지막 장을 덮고 나서 다시 찾아보았다.",
      work: { ...works[1], ownerId: null, isPublic: true },
    },
  ].map((sample) => structuredClone(sample)) as PublicEntry[];
}
