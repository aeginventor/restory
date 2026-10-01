import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { readFile } from "node:fs/promises";

const storageKey = "restory.demo.v1";

async function startEntry(page: Page, testInfo: TestInfo) {
  if (testInfo.project.name === "mobile") {
    await page
      .getByRole("button", { name: "새 기록 남기기", exact: true })
      .click();
  } else {
    await page
      .getByRole("main")
      .getByRole("button", { name: "기록 남기기", exact: true })
      .click();
  }
  return page.getByRole("dialog");
}

async function openSettings(page: Page, testInfo: TestInfo) {
  await page
    .getByRole("button", {
      name: testInfo.project.name === "mobile" ? "설정" : /체험 아카이브/,
      exact: testInfo.project.name === "mobile",
    })
    .click();
  return page.getByRole("dialog", { name: "체험 아카이브 설정" });
}

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "남겨둔 이야기", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "퍼펙트 데이즈 감상 보기", exact: true }),
  ).toBeVisible();
});

test("예시 기록을 표시하고 제목, 매체, 연도, 태그와 책갈피로 찾는다", async ({
  page,
}) => {
  await expect(
    page.getByText(
      "예시 기록으로 둘러보고 자유롭게 적어보세요. 기록은 이 브라우저에만 저장돼요.",
    ),
  ).toBeVisible();
  await expect(page.getByRole("main").getByRole("article")).toHaveCount(7);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);

  await page.getByRole("textbox", { name: "내 기록 검색" }).fill("괴물");
  await expect(
    page.getByRole("button", { name: "괴물 감상 보기", exact: true }),
  ).toHaveCount(2);
  await page.getByRole("button", { name: "필터", exact: true }).click();
  await page
    .getByRole("combobox", { name: "감상 연도 필터" })
    .selectOption("2026");
  await page.getByRole("combobox", { name: "매체 필터" }).selectOption("film");
  await page
    .getByRole("combobox", { name: "감정 태그 필터" })
    .selectOption("여운");
  await expect(
    page.getByRole("button", { name: "괴물 감상 보기", exact: true }),
  ).toHaveCount(1);
  await expect(
    page.getByText("다시 보니 처음에 놓쳤던 표정이 보였다.", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "초기화", exact: true }).click();

  await page
    .getByRole("combobox", { name: "감상 연도 필터" })
    .selectOption("unknown");
  await expect(page.getByRole("main").getByRole("article")).toHaveCount(1);
  await expect(
    page.getByRole("button", { name: "애프터썬 감상 보기", exact: true }),
  ).toContainText("시점 모름");
  await page.getByRole("button", { name: "초기화", exact: true }).click();

  await page
    .getByRole("button", { name: "오래 기억할 작품", exact: true })
    .click();
  await expect(page.getByRole("main").getByRole("article")).toHaveCount(3);
  await page
    .getByRole("button", {
      name: "퍼펙트 데이즈 오래 기억하기 해제",
      exact: true,
    })
    .click();
  await expect(page.getByRole("main").getByRole("article")).toHaveCount(2);
  await page.reload();
  await expect(
    page.getByRole("button", {
      name: "퍼펙트 데이즈 오래 기억하기 추가",
      exact: true,
    }),
  ).toBeVisible();
});

test("직접 등록, 연도 기록, 재감상, 수정, 삭제를 거쳐도 다른 감상은 보존된다", async ({
  page,
}, testInfo) => {
  const title = "테스트용 산책 이야기";
  let dialog = await startEntry(page, testInfo);
  await dialog
    .getByRole("textbox", { name: "어떤 작품을 만났나요?" })
    .fill(title);
  await dialog
    .getByRole("button", { name: `“${title}” 직접 등록`, exact: true })
    .click();
  await dialog
    .getByRole("combobox", { name: "매체", exact: true })
    .selectOption("book");
  await dialog
    .getByRole("spinbutton", { name: "발표 연도", exact: true })
    .fill("2024");
  await dialog.getByRole("textbox", { name: /작가 \/ 감독/ }).fill("가상 작가");
  await dialog
    .getByRole("combobox", { name: "언제 감상했나요?" })
    .selectOption("year");
  await dialog.getByRole("spinbutton", { name: "감상한 시점" }).fill("2024");
  await dialog
    .getByRole("textbox", { name: /그때의 감상을 남겨보세요/ })
    .fill("첫 감상은 그대로 보관한다.");
  await dialog
    .getByRole("textbox", { name: "긴 감상", exact: true })
    .fill("연도만 기억나는 작품도 남겨 둔다.");
  await dialog.getByRole("button", { name: "여운", exact: true }).click();
  await dialog.getByRole("button", { name: "기록 저장", exact: true }).click();
  await expect(dialog).not.toBeVisible();
  const workButton = page.getByRole("button", {
    name: `${title} 감상 보기`,
    exact: true,
  });
  await expect(workButton).toContainText("2024년");
  await expect(workButton).not.toContainText("1월");

  await workButton.click();
  dialog = page.getByRole("dialog", { name: "작품과 나의 기록" });
  await dialog
    .getByRole("button", { name: "새 감상 추가", exact: true })
    .click();
  dialog = page.getByRole("dialog", { name: "다시 만난 이야기" });
  await dialog
    .getByRole("combobox", { name: "언제 감상했나요?" })
    .selectOption("unknown");
  await expect(dialog.getByLabel("감상한 시점", { exact: true })).toHaveCount(
    0,
  );
  await dialog
    .getByRole("textbox", { name: /그때의 감상을 남겨보세요/ })
    .fill("두 번째에는 다른 부분이 보였다.");
  await dialog.getByRole("button", { name: "기록 저장", exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await page.reload();
  await expect(workButton).toHaveCount(2);

  await workButton.first().click();
  dialog = page.getByRole("dialog", { name: "작품과 나의 기록" });
  await expect(
    dialog.getByRole("heading", {
      name: "첫 감상은 그대로 보관한다.",
      exact: true,
    }),
  ).toBeVisible();
  const second = dialog.getByRole("article").filter({
    has: page.getByRole("heading", {
      name: "두 번째에는 다른 부분이 보였다.",
      exact: true,
    }),
  });
  await second.getByRole("button", { name: "수정", exact: true }).click();
  dialog = page.getByRole("dialog", { name: "감상 수정하기" });
  await dialog
    .getByRole("textbox", { name: /그때의 감상을 남겨보세요/ })
    .fill("두 번째 감상만 수정했다.");
  await dialog.getByRole("button", { name: "수정 저장", exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await workButton.first().click();
  dialog = page.getByRole("dialog", { name: "작품과 나의 기록" });
  await expect(
    dialog.getByRole("heading", {
      name: "첫 감상은 그대로 보관한다.",
      exact: true,
    }),
  ).toBeVisible();
  const edited = dialog.getByRole("article").filter({
    has: page.getByRole("heading", {
      name: "두 번째 감상만 수정했다.",
      exact: true,
    }),
  });
  await expect(edited).toBeVisible();
  page.once("dialog", (prompt) => prompt.dismiss());
  await edited.getByRole("button", { name: "삭제", exact: true }).click();
  await expect(edited).toBeVisible();
  page.once("dialog", (prompt) => prompt.accept());
  await edited.getByRole("button", { name: "삭제", exact: true }).click();
  await expect(edited).toHaveCount(0);
  await expect(
    dialog.getByRole("heading", {
      name: "첫 감상은 그대로 보관한다.",
      exact: true,
    }),
  ).toBeVisible();
  await dialog.getByRole("button", { name: "닫기", exact: true }).click();
  await page.reload();
  await expect(workButton).toHaveCount(1);
  await expect(workButton).toContainText("첫 감상은 그대로 보관한다.");
});

test("기록을 내보내고 확인 문구를 입력한 뒤 삭제하면 새로고침에도 비어 있다", async ({
  page,
}, testInfo) => {
  const dialog = await openSettings(page, testInfo);
  const pendingDownload = page.waitForEvent("download");
  await dialog
    .getByRole("button", { name: "기록 내보내기", exact: true })
    .click();
  const download = await pendingDownload;
  expect(download.suggestedFilename()).toMatch(
    /^restory-\d{4}-\d{2}-\d{2}\.json$/,
  );
  const filePath = await download.path();
  expect(filePath).not.toBeNull();
  const exported = JSON.parse(await readFile(filePath!, "utf8"));
  expect(exported.schema).toBe("restory.archive");
  expect(exported.version).toBe(1);
  expect(exported.works).toHaveLength(6);
  expect(exported.entries).toHaveLength(7);
  expect(
    exported.entries.filter(
      (entry: { datePrecision: string }) => entry.datePrecision === "unknown",
    )[0].experiencedOn,
  ).toBeNull();
  await expect(
    dialog.getByRole("button", { name: "체험 기록 삭제", exact: true }),
  ).toBeDisabled();
  await dialog
    .getByRole("textbox", { name: "확인하려면 ‘삭제’를 입력해 주세요." })
    .fill("삭제");
  await dialog
    .getByRole("button", { name: "체험 기록 삭제", exact: true })
    .click();
  await expect(dialog).not.toBeVisible();
  await expect(
    page.getByRole("heading", { name: "첫 이야기를 남겨보세요.", exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "첫 이야기를 남겨보세요.", exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("main").getByRole("article")).toHaveCount(0);
});

test("공개 감상 예시를 구분하고 스포일러는 선택했을 때만 펼친다", async ({
  page,
}, testInfo) => {
  await page
    .getByRole("button", {
      name:
        testInfo.project.name === "mobile"
          ? "감상 둘러보기"
          : "다른 사람의 감상",
      exact: true,
    })
    .click();
  await expect(
    page.getByText(
      "아래 감상은 체험을 위해 작성한 예시입니다. 실제 이용자 게시물이 아니에요.",
    ),
  ).toBeVisible();
  await expect(page.getByRole("main").getByRole("article")).toHaveCount(3);
  const monster = page
    .getByRole("article")
    .filter({ has: page.getByRole("heading", { name: "괴물", exact: true }) });
  await expect(
    monster.getByText("스포일러가 포함된 감상이에요."),
  ).toBeVisible();
  await expect(
    monster.getByRole("heading", {
      name: "두 번째 보았을 때의 감상",
      exact: true,
    }),
  ).toHaveCount(0);
  await monster
    .getByRole("button", { name: "감상 펼치기", exact: true })
    .click();
  await expect(
    monster.getByRole("heading", {
      name: "두 번째 보았을 때의 감상",
      exact: true,
    }),
  ).toBeVisible();
  await expect(monster.getByText(/가상 사용자 준/)).toBeVisible();
  await expect(
    page.getByRole("button", { name: "신고", exact: true }),
  ).toHaveCount(0);
  await page
    .getByRole("textbox", { name: "공개 감상 검색" })
    .fill("지구 끝의 온실");
  await expect(page.getByRole("main").getByRole("article")).toHaveCount(1);
});

test("저장 실패 후 입력 내용과 기존 기록을 그대로 유지한다", async ({
  page,
}, testInfo) => {
  const before = await page.evaluate(
    (key) => localStorage.getItem(key),
    storageKey,
  );
  const dialog = await startEntry(page, testInfo);
  await dialog.getByRole("button", { name: /퍼펙트 데이즈/ }).click();
  await dialog
    .getByRole("textbox", { name: /그때의 감상을 남겨보세요/ })
    .fill("실패해도 잃지 않을 감상");
  await page.evaluate(() => {
    Storage.prototype.setItem = function () {
      throw new DOMException("Storage full", "QuotaExceededError");
    };
  });
  await dialog.getByRole("button", { name: "기록 저장", exact: true }).click();
  await expect(dialog.getByRole("alert")).toContainText("저장하지 못했습니다");
  await expect(
    dialog.getByRole("textbox", { name: /그때의 감상을 남겨보세요/ }),
  ).toHaveValue("실패해도 잃지 않을 감상");
  expect(
    await page.evaluate((key) => localStorage.getItem(key), storageKey),
  ).toBe(before);
});

test("손상된 저장 자료는 오류를 알리고 재시도해도 덮어쓰지 않는다", async ({
  page,
}) => {
  const corrupted = "{recover-this-original-data";
  await page.evaluate(({ key, value }) => localStorage.setItem(key, value), {
    key: storageKey,
    value: corrupted,
  });
  await page.reload();
  await expect(page.getByRole("main").getByRole("alert")).toContainText(
    "기록을 불러오지 못했어요.",
  );
  await expect(page.getByRole("main").getByRole("alert")).toContainText(
    "기존 데이터는 덮어쓰지 않았습니다.",
  );
  await page.getByRole("button", { name: "다시 시도", exact: true }).click();
  expect(
    await page.evaluate((key) => localStorage.getItem(key), storageKey),
  ).toBe(corrupted);
  await expect(
    page
      .getByRole("main")
      .getByRole("button", { name: "기록 남기기", exact: true }),
  ).toBeDisabled();
});

test("모달에서 Escape로 닫고 수정 중인 글은 확인 없이 버리지 않는다", async ({
  page,
}, testInfo) => {
  let dialog = await startEntry(page, testInfo);
  await expect(
    dialog.getByRole("textbox", { name: "어떤 작품을 만났나요?" }),
  ).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();
  dialog = await startEntry(page, testInfo);
  await dialog
    .getByRole("textbox", { name: /그때의 감상을 남겨보세요/ })
    .fill("작성 중인 감상");
  page.once("dialog", (prompt) => prompt.dismiss());
  await page.keyboard.press("Escape");
  await expect(dialog).toBeVisible();
  await expect(
    dialog.getByRole("textbox", { name: /그때의 감상을 남겨보세요/ }),
  ).toHaveValue("작성 중인 감상");
  page.once("dialog", (prompt) => prompt.accept());
  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();
});

test("연도만 아는 기록을 날짜로 바꿀 때 날짜를 임의로 채우지 않는다", async ({
  page,
}, testInfo) => {
  const dialog = await startEntry(page, testInfo);
  await dialog.getByRole("button", { name: /퍼펙트 데이즈/ }).click();
  await dialog
    .getByRole("combobox", { name: "언제 감상했나요?" })
    .selectOption("year");
  await dialog.getByRole("spinbutton", { name: "감상한 시점" }).fill("2021");
  await dialog
    .getByRole("combobox", { name: "언제 감상했나요?" })
    .selectOption("day");
  await expect(dialog.getByLabel("감상한 시점", { exact: true })).toHaveValue(
    "",
  );
  await dialog.getByRole("button", { name: "기록 저장", exact: true }).click();
  await expect(dialog).toBeVisible();
  await expect(dialog.getByLabel("감상한 시점", { exact: true })).toBeFocused();
  await dialog.getByLabel("감상한 시점", { exact: true }).fill("2021-07-16");
  await dialog.getByRole("button", { name: "기록 저장", exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect(
    page
      .getByRole("button", { name: "퍼펙트 데이즈 감상 보기", exact: true })
      .filter({ hasText: "2021년 7월 16일" }),
  ).toBeVisible();
});
