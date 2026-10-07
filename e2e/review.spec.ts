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

async function openExplore(page: Page, testInfo: TestInfo) {
  await page
    .getByRole("button", {
      name:
        testInfo.project.name === "mobile"
          ? "감상 둘러보기"
          : "다른 사람의 감상",
      exact: true,
    })
    .click();
}

async function editEntry(page: Page, title: string, summary: string) {
  await page
    .getByRole("button", { name: `${title} 감상 보기`, exact: true })
    .click();
  const detail = page.getByRole("dialog", { name: "작품과 나의 기록" });
  await detail.getByRole("button", { name: "수정", exact: true }).click();
  const editor = page.getByRole("dialog", { name: "감상 수정하기" });
  await editor
    .getByRole("textbox", { name: /그때의 감상을 남겨보세요/ })
    .fill(summary);
  return editor;
}

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "퍼펙트 데이즈 감상 보기", exact: true }),
  ).toBeVisible();
});

test("책갈피를 눌러도 다른 탭에서 고친 감상을 덮어쓰지 않는다", async ({
  page,
  context,
}) => {
  const other = await context.newPage();
  await other.goto("/");
  const editor = await editEntry(
    other,
    "퍼펙트 데이즈",
    "다른 탭에서 고친 감상",
  );
  await editor.getByRole("button", { name: "수정 저장", exact: true }).click();
  await expect(editor).not.toBeVisible();
  await other.close();

  const bookmark = page
    .getByRole("button", { name: /^퍼펙트 데이즈 오래 기억하기/ })
    .first();
  const before = await bookmark.getAttribute("aria-pressed");
  await bookmark.click();
  const card = page.getByRole("button", {
    name: "퍼펙트 데이즈 감상 보기",
    exact: true,
  });
  await expect(card).toContainText("다른 탭에서 고친 감상");
  await expect(
    page.getByRole("button", { name: /^퍼펙트 데이즈 오래 기억하기/ }).first(),
  ).toHaveAttribute("aria-pressed", before === "true" ? "false" : "true");
  await page.reload();
  await expect(card).toContainText("다른 탭에서 고친 감상");
});

test("예전 화면에서 저장하면 충돌을 알리고 입력과 최신 기록을 모두 보존한다", async ({
  page,
  context,
}) => {
  const editor = await editEntry(page, "퍼펙트 데이즈", "이 탭에서 쓰던 감상");
  const other = await context.newPage();
  await other.goto("/");
  const otherEditor = await editEntry(
    other,
    "퍼펙트 데이즈",
    "먼저 저장된 감상",
  );
  await otherEditor
    .getByRole("button", { name: "수정 저장", exact: true })
    .click();
  await expect(otherEditor).not.toBeVisible();
  await other.close();

  await editor.getByRole("button", { name: "수정 저장", exact: true }).click();
  await expect(editor.getByRole("alert")).toContainText("다른 곳에서 변경");
  await expect(
    editor.getByRole("textbox", { name: /그때의 감상을 남겨보세요/ }),
  ).toHaveValue("이 탭에서 쓰던 감상");
  const stored = await page.evaluate(
    (key) => localStorage.getItem(key) ?? "",
    storageKey,
  );
  expect(stored).toContain("먼저 저장된 감상");
  expect(stored).not.toContain("이 탭에서 쓰던 감상");
});

test("새로고침 뒤에도 쓰던 글을 이어서 쓰거나 버릴 수 있다", async ({
  page,
}, testInfo) => {
  page.on("dialog", (dialog) => dialog.accept());
  let dialog = await startEntry(page, testInfo);
  await dialog.getByRole("button", { name: /퍼펙트 데이즈/ }).click();
  await dialog
    .getByRole("textbox", { name: /그때의 감상을 남겨보세요/ })
    .fill("새로고침 전에 쓰던 감상");
  await dialog.getByRole("button", { name: "여운", exact: true }).click();
  await expect
    .poll(() =>
      page.evaluate(() =>
        Object.keys(localStorage).some((key) =>
          key.startsWith("restory.draft."),
        ),
      ),
    )
    .toBe(true);
  await page.reload();
  await expect(
    page.getByRole("button", { name: "퍼펙트 데이즈 감상 보기", exact: true }),
  ).toBeVisible();

  dialog = await startEntry(page, testInfo);
  await expect(dialog.getByRole("status")).toContainText(
    "저장하지 않은 글이 있어요.",
  );
  await expect(
    dialog.getByRole("textbox", { name: /그때의 감상을 남겨보세요/ }),
  ).toHaveValue("");
  await dialog
    .getByRole("button", { name: "이어서 쓰기", exact: true })
    .click();
  await expect(
    dialog.getByRole("textbox", { name: /그때의 감상을 남겨보세요/ }),
  ).toHaveValue("새로고침 전에 쓰던 감상");
  await expect(
    dialog.getByText("퍼펙트 데이즈", { exact: true }),
  ).toBeVisible();
  await expect(
    dialog.getByRole("button", { name: "여운", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");

  // Closing a dirty editor after confirming discards the draft too.
  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();
  dialog = await startEntry(page, testInfo);
  await expect(dialog.getByRole("status")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "퍼펙트 데이즈 감상 보기", exact: true }),
  ).toHaveCount(1);
});

test("공개 감상 검색은 전체에서 찾고 작품별 공개 감상으로 이동한다", async ({
  page,
}, testInfo) => {
  await openExplore(page, testInfo);
  await expect(page.getByRole("main").getByRole("article")).toHaveCount(3);
  const search = page.getByRole("textbox", { name: "공개 감상 검색" });
  await search.fill("없는 작품 zzz");
  await expect(page.getByRole("main").getByRole("status")).toContainText(
    "‘없는 작품 zzz’에 맞는 공개 감상이 없어요.",
  );
  await search.fill("지구 끝의 온실");
  await expect(page.getByRole("main").getByRole("article")).toHaveCount(1);
  await page
    .getByRole("main")
    .getByRole("article")
    .getByRole("button", { name: "지구 끝의 온실", exact: true })
    .click();
  await expect(page).toHaveURL(/\/works\//);
  await expect(
    page
      .locator(".public-work > header")
      .getByRole("heading", { name: "지구 끝의 온실", exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("main").getByRole("article")).toHaveCount(1);
  await page
    .getByRole("button", { name: "모든 공개 감상", exact: true })
    .click();
  await expect(page).toHaveURL(/\/$/);
  // The search term is kept when returning to the full list.
  await expect(search).toHaveValue("지구 끝의 온실");
  await expect(page.getByRole("main").getByRole("article")).toHaveCount(1);
  await search.fill("");
  await expect(page.getByRole("main").getByRole("article")).toHaveCount(3);

  // A shared work address that is not in my archive opens the public view directly.
  await page.goto("/works/00000000-0000-4000-8000-0000000000ef");
  await expect(
    page.getByRole("button", { name: "모든 공개 감상", exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("main").getByRole("status")).toContainText(
    "이 작품의 공개 감상이 아직 없어요.",
  );
});

test("내보낸 기록을 지운 뒤 다시 가져오면 비공개로 복원되고 중복은 건너뛴다", async ({
  page,
}, testInfo) => {
  let dialog = await openSettings(page, testInfo);
  const pendingDownload = page.waitForEvent("download");
  await dialog
    .getByRole("button", { name: "기록 내보내기", exact: true })
    .click();
  const filePath = await (await pendingDownload).path();
  expect(filePath).not.toBeNull();

  await dialog
    .getByRole("textbox", { name: "확인하려면 ‘삭제’를 입력해 주세요." })
    .fill("삭제");
  await dialog
    .getByRole("button", { name: "체험 기록 삭제", exact: true })
    .click();
  await expect(dialog).not.toBeVisible();
  await expect(page.getByRole("main").getByRole("article")).toHaveCount(0);

  dialog = await openSettings(page, testInfo);
  await dialog.getByLabel("가져올 기록 파일").setInputFiles(filePath!);
  await expect(dialog.getByRole("status")).toContainText(
    /감상 7개를 추가하고, 같은 내용 0개는 건너뜁니다/,
  );
  await dialog.getByRole("button", { name: "가져오기", exact: true }).click();
  await expect(page.getByText(/감상 7개를 비공개로 가져왔어요/)).toBeVisible();

  await dialog.getByLabel("가져올 기록 파일").setInputFiles(filePath!);
  await expect(dialog.getByRole("status")).toContainText(
    /감상 0개를 추가하고, 같은 내용 7개는 건너뜁니다/,
  );
  await expect(
    dialog.getByRole("button", { name: "가져오기", exact: true }),
  ).toBeDisabled();
  await dialog.getByRole("button", { name: "닫기", exact: true }).click();
  await expect(page.getByRole("main").getByRole("article")).toHaveCount(7);
  const exported = JSON.parse(await readFile(filePath!, "utf8"));
  expect(exported.entries).toHaveLength(7);
  await page.reload();
  await expect(page.getByRole("main").getByRole("article")).toHaveCount(7);
});

test("손상된 체험 자료는 원본을 내려받고 초기화할 수 있다", async ({
  page,
}) => {
  const corrupted = "{recover-this-original-data";
  await page.evaluate(({ key, value }) => localStorage.setItem(key, value), {
    key: storageKey,
    value: corrupted,
  });
  await page.reload();
  const alert = page.getByRole("main").getByRole("alert");
  await expect(alert).toContainText("기존 데이터는 덮어쓰지 않았습니다.");
  const pendingDownload = page.waitForEvent("download");
  await alert
    .getByRole("button", { name: "원본 내려받기", exact: true })
    .click();
  const download = await pendingDownload;
  expect(await readFile((await download.path())!, "utf8")).toBe(corrupted);
  expect(
    await page.evaluate((key) => localStorage.getItem(key), storageKey),
  ).toBe(corrupted);

  page.once("dialog", (dialog) => dialog.dismiss());
  await alert
    .getByRole("button", { name: "체험 데이터 초기화", exact: true })
    .click();
  await expect(alert).toBeVisible();
  page.once("dialog", (dialog) => dialog.accept());
  await alert
    .getByRole("button", { name: "체험 데이터 초기화", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "남겨둔 이야기", exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("main").getByRole("article")).toHaveCount(7);
});
