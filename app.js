import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

const config = window.APP_CONFIG ?? {};
const setupPanel = document.querySelector("#setup-panel");
const setupMessage = document.querySelector("#setup-message");
const authPanel = document.querySelector("#auth-panel");
const appPanel = document.querySelector("#app-panel");
const signOutButton = document.querySelector("#sign-out-button");
const authForm = document.querySelector("#auth-form");
const signUpButton = document.querySelector("#sign-up-button");
const authStatus = document.querySelector("#auth-status");
const statsGrid = document.querySelector("#stats-grid");
const homeSummary = document.querySelector("#home-summary");
const refreshButton = document.querySelector("#refresh-button");
const startReviewButton = document.querySelector("#start-review-button");
const browseList = document.querySelector("#browse-list");
const searchInput = document.querySelector("#search-input");
const levelFilter = document.querySelector("#level-filter");
const addForm = document.querySelector("#add-form");
const reviewEmpty = document.querySelector("#review-empty");
const reviewCard = document.querySelector("#review-card");
const reviewProgress = document.querySelector("#review-progress");
const reviewWord = document.querySelector("#review-word");
const reviewExample = document.querySelector("#review-example");
const reviewReading = document.querySelector("#review-reading");
const reviewRomaji = document.querySelector("#review-romaji");
const reviewMeaning = document.querySelector("#review-meaning");
const reviewExampleReading = document.querySelector("#review-example-reading");
const reviewExampleZh = document.querySelector("#review-example-zh");
const reviewAnswer = document.querySelector("#review-answer");
const toggleAnswerButton = document.querySelector("#toggle-answer-button");
const rememberedButton = document.querySelector("#remembered-button");
const learningButton = document.querySelector("#learning-button");
const reviewWordAudioButton = document.querySelector("#review-word-audio");
const reviewSentenceAudioButton = document.querySelector("#review-sentence-audio");
const statCardTemplate = document.querySelector("#stat-card-template");
const wordItemTemplate = document.querySelector("#word-item-template");
const tabButtons = Array.from(document.querySelectorAll(".tab-button"));
const tabPanels = Array.from(document.querySelectorAll(".tab-panel"));

const intervals = [1, 3, 7, 14, 21, 30];
const state = {
  supabase: null,
  session: null,
  profile: null,
  items: [],
  filteredItems: [],
  reviewQueue: [],
  reviewIndex: 0,
  speechCounts: new Map(),
  currentUtterance: null
};

const todayString = () => new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Taipei" });

function showSetup(message) {
  setupMessage.textContent = message;
  setupPanel.classList.remove("hidden");
  authPanel.classList.add("hidden");
  appPanel.classList.add("hidden");
}

function hideSetup() {
  setupPanel.classList.add("hidden");
}

function setAuthStatus(message, isError = false) {
  authStatus.textContent = message;
  authStatus.style.color = isError ? "#b42318" : "";
}

function setLoggedInUi(isLoggedIn) {
  authPanel.classList.toggle("hidden", isLoggedIn);
  appPanel.classList.toggle("hidden", !isLoggedIn);
  signOutButton.classList.toggle("hidden", !isLoggedIn);
}

function switchTab(tabName) {
  for (const button of tabButtons) {
    button.classList.toggle("active", button.dataset.tab === tabName);
  }
  for (const panel of tabPanels) {
    panel.classList.toggle("active", panel.dataset.panel === tabName);
  }
}

function deriveMemoryType(reviewCount) {
  if (reviewCount <= 0) {
    return "new";
  }
  if (reviewCount <= 3) {
    return "short_term";
  }
  return "long_term";
}

function getIntervalDays(reviewCount) {
  const index = Math.min(Math.max(reviewCount - 1, 0), intervals.length - 1);
  return intervals[index];
}

function addDays(baseDateString, days) {
  const baseDate = baseDateString ? new Date(`${baseDateString}T00:00:00`) : new Date();
  baseDate.setDate(baseDate.getDate() + days);
  return baseDate.toLocaleDateString("en-CA", { timeZone: "Asia/Taipei" });
}

function getDueItems(items) {
  const today = todayString();
  return items
    .filter((item) => !item.next_review || item.next_review <= today)
    .sort((a, b) => {
      const aDate = a.next_review ?? "0000-00-00";
      const bDate = b.next_review ?? "0000-00-00";
      return aDate.localeCompare(bDate);
    });
}

function formatMemoryType(memoryType) {
  if (memoryType === "short_term") {
    return "短期記憶";
  }
  if (memoryType === "long_term") {
    return "長期記憶";
  }
  return "新單字";
}

function formatReviewDate(dateText) {
  if (!dateText) {
    return "未安排";
  }
  return dateText;
}

function renderStats() {
  const dueItems = getDueItems(state.items);
  const stats = [
    { label: "總單字", value: state.items.length },
    { label: "今日到期", value: dueItems.length },
    { label: "新單字", value: state.items.filter((item) => item.memory_type === "new").length },
    { label: "短期記憶", value: state.items.filter((item) => item.memory_type === "short_term").length },
    { label: "長期記憶", value: state.items.filter((item) => item.memory_type === "long_term").length }
  ];

  statsGrid.innerHTML = "";
  for (const stat of stats) {
    const node = statCardTemplate.content.firstElementChild.cloneNode(true);
    node.querySelector(".stat-label").textContent = stat.label;
    node.querySelector(".stat-value").textContent = stat.value;
    statsGrid.appendChild(node);
  }

  const summary = [
    `目前共有 ${state.items.length} 筆資料。`,
    `今天需要處理 ${dueItems.length} 筆到期或尚未排程的單字。`,
    `複習時會依照 next_review 由近到遠排序。`
  ];
  homeSummary.innerHTML = summary
    .map((line) => `<div class="summary-item">${line}</div>`)
    .join("");
}

function getSearchFilteredItems() {
  const query = searchInput.value.trim().toLowerCase();
  const level = levelFilter.value;
  return state.items.filter((item) => {
    const matchesLevel = level === "ALL" || item.level === level;
    const haystack = [
      item.jp_word,
      item.jp_word1,
      item.jp_word2,
      item.romaji,
      item.zh_word,
      item.example_sentence
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    const matchesQuery = !query || haystack.includes(query);
    return matchesLevel && matchesQuery;
  });
}

function renderBrowseList() {
  state.filteredItems = getSearchFilteredItems();
  browseList.innerHTML = "";

  if (!state.filteredItems.length) {
    browseList.innerHTML = '<div class="empty-state">沒有符合條件的單字。</div>';
    return;
  }

  for (const item of state.filteredItems) {
    const node = wordItemTemplate.content.firstElementChild.cloneNode(true);
    node.querySelector(".word-title").textContent = item.jp_word ?? "-";
    node.querySelector(".word-reading").textContent = [item.jp_word1, item.jp_word2, item.romaji].filter(Boolean).join(" / ") || "尚未填寫讀音";
    node.querySelector(".word-meaning").textContent = item.zh_word || "尚未填寫中文意思";
    node.querySelector(".word-example").textContent = item.example_sentence || "尚未填寫例句";
    node.querySelector(".word-meta").textContent = `記憶狀態：${formatMemoryType(item.memory_type)} | 下次複習：${formatReviewDate(item.next_review)}`;
    node.querySelector(".level-pill").textContent = item.level;
    node.querySelector(".play-word-button").addEventListener("click", () => {
      speakJapanese(item.word_audio_text || item.jp_word);
    });
    node.querySelector(".play-sentence-button").addEventListener("click", () => {
      speakJapanese(item.sentence_audio_text || item.example_sentence || item.jp_word);
    });
    node.querySelector(".delete-word-button").addEventListener("click", () => deleteWord(item.id, item.jp_word));
    browseList.appendChild(node);
  }
}

function resetReviewState() {
  state.reviewQueue = getDueItems(state.items);
  state.reviewIndex = 0;
  reviewAnswer.classList.add("hidden");
  toggleAnswerButton.textContent = "顯示答案";
  renderReviewCard();
}

function renderReviewCard() {
  const item = state.reviewQueue[state.reviewIndex];
  const total = state.reviewQueue.length;

  if (!item) {
    reviewCard.classList.add("hidden");
    reviewEmpty.classList.remove("hidden");
    reviewEmpty.innerHTML = "<p>目前沒有到期或待複習的單字。</p>";
    return;
  }

  reviewEmpty.classList.add("hidden");
  reviewCard.classList.remove("hidden");
  reviewProgress.textContent = `${state.reviewIndex + 1} / ${total}`;
  reviewWord.textContent = item.jp_word || "-";
  reviewExample.textContent = item.example_sentence || "這張卡目前沒有例句。";
  reviewReading.textContent = [item.jp_word1, item.jp_word2].filter(Boolean).join(" / ") || "-";
  reviewRomaji.textContent = item.romaji || "-";
  reviewMeaning.textContent = item.zh_word || "-";
  reviewExampleReading.textContent = item.example_hiragana || "-";
  reviewExampleZh.textContent = item.example_zh || "-";

  reviewWordAudioButton.onclick = () => speakJapanese(item.word_audio_text || item.jp_word);
  reviewSentenceAudioButton.onclick = () => speakJapanese(item.sentence_audio_text || item.example_sentence || item.jp_word);
}

function toggleReviewAnswer() {
  const isHidden = reviewAnswer.classList.toggle("hidden");
  toggleAnswerButton.textContent = isHidden ? "顯示答案" : "收起答案";
}

async function handleReview(resultType) {
  const item = state.reviewQueue[state.reviewIndex];
  if (!item) {
    return;
  }

  const nextReviewCount = resultType === "remembered"
    ? item.review_count + 1
    : Math.max(item.review_count - 2, 0);
  const intervalDays = getIntervalDays(nextReviewCount);
  const payload = {
    review_count: nextReviewCount,
    interval_days: intervalDays,
    memory_type: deriveMemoryType(nextReviewCount),
    next_review: addDays(todayString(), intervalDays),
    last_reviewed: todayString()
  };

  rememberedButton.disabled = true;
  learningButton.disabled = true;

  const { error } = await state.supabase
    .from("vocab_items")
    .update(payload)
    .eq("id", item.id);

  rememberedButton.disabled = false;
  learningButton.disabled = false;

  if (error) {
    window.alert(`更新複習結果失敗：${error.message}`);
    return;
  }

  const targetIndex = state.items.findIndex((entry) => entry.id === item.id);
  if (targetIndex >= 0) {
    state.items[targetIndex] = { ...state.items[targetIndex], ...payload };
  }

  state.reviewIndex += 1;
  reviewAnswer.classList.add("hidden");
  toggleAnswerButton.textContent = "顯示答案";
  renderStats();
  renderBrowseList();
  renderReviewCard();
}

function getJapaneseVoice() {
  const voices = window.speechSynthesis?.getVoices?.() ?? [];
  return voices.find((voice) => voice.lang?.toLowerCase().startsWith("ja")) ?? null;
}

function speakJapanese(text) {
  const value = (text || "").trim();
  if (!value) {
    return;
  }

  if (!("speechSynthesis" in window)) {
    window.alert("這個瀏覽器不支援語音播放。");
    return;
  }

  const currentCount = (state.speechCounts.get(value) ?? 0) + 1;
  state.speechCounts.set(value, currentCount);

  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(value);
  const voice = getJapaneseVoice();
  utterance.lang = "ja-JP";
  utterance.rate = currentCount % 3 === 0 ? config.slowPlaybackRate ?? 0.6 : config.normalPlaybackRate ?? 0.95;
  if (voice) {
    utterance.voice = voice;
  }
  state.currentUtterance = utterance;
  window.speechSynthesis.speak(utterance);
}

async function deleteWord(id, label) {
  const shouldDelete = window.confirm(`確定要刪除「${label}」嗎？`);
  if (!shouldDelete) {
    return;
  }

  const { error } = await state.supabase
    .from("vocab_items")
    .delete()
    .eq("id", id);

  if (error) {
    window.alert(`刪除失敗：${error.message}`);
    return;
  }

  state.items = state.items.filter((item) => item.id !== id);
  renderStats();
  renderBrowseList();
  resetReviewState();
}

async function loadItems() {
  const { data, error } = await state.supabase
    .from("vocab_items")
    .select("*")
    .order("next_review", { ascending: true, nullsFirst: true })
    .order("id", { ascending: true });

  if (error) {
    window.alert(`讀取單字失敗：${error.message}`);
    return;
  }

  state.items = data ?? [];
  renderStats();
  renderBrowseList();
  resetReviewState();
}

async function handleSignIn(event) {
  event.preventDefault();
  const formData = new FormData(authForm);
  const email = String(formData.get("email") || "").trim();
  const password = String(formData.get("password") || "").trim();

  setAuthStatus("登入中...");
  const { error } = await state.supabase.auth.signInWithPassword({ email, password });
  if (error) {
    setAuthStatus(`登入失敗：${error.message}`, true);
    return;
  }
  setAuthStatus("登入成功，正在載入資料...");
}

async function handleSignUp() {
  const formData = new FormData(authForm);
  const email = String(formData.get("email") || "").trim();
  const password = String(formData.get("password") || "").trim();

  if (!email || !password) {
    setAuthStatus("請先填入 Email 和 Password。", true);
    return;
  }

  setAuthStatus("註冊中...");
  const { error } = await state.supabase.auth.signUp({ email, password });
  if (error) {
    setAuthStatus(`註冊失敗：${error.message}`, true);
    return;
  }
  setAuthStatus("註冊完成，若有開啟驗證信請先去收信。");
}

async function handleAddWord(event) {
  event.preventDefault();
  if (!state.session?.user?.id) {
    window.alert("請先登入。");
    return;
  }

  const formData = new FormData(addForm);
  const payload = {
    owner_id: state.session.user.id,
    jp_word: String(formData.get("jp_word") || "").trim(),
    jp_word1: String(formData.get("jp_word1") || "").trim() || null,
    jp_word2: String(formData.get("jp_word2") || "").trim() || null,
    romaji: String(formData.get("romaji") || "").trim() || null,
    zh_word: String(formData.get("zh_word") || "").trim() || null,
    example_sentence: String(formData.get("example_sentence") || "").trim() || null,
    example_hiragana: String(formData.get("example_hiragana") || "").trim() || null,
    example_zh: String(formData.get("example_zh") || "").trim() || null,
    word_audio_text: String(formData.get("jp_word") || "").trim() || null,
    sentence_audio_text: String(formData.get("example_sentence") || "").trim() || null,
    level: String(formData.get("level") || config.defaultLevel || "N5"),
    review_count: 0,
    interval_days: 0,
    memory_type: "new",
    next_review: todayString(),
    last_reviewed: null
  };

  const { data, error } = await state.supabase
    .from("vocab_items")
    .insert(payload)
    .select()
    .single();

  if (error) {
    window.alert(`新增失敗：${error.message}`);
    return;
  }

  addForm.reset();
  state.items.unshift(data);
  renderStats();
  renderBrowseList();
  resetReviewState();
  switchTab("browse");
}

async function handleSession(session) {
  state.session = session;

  if (!session) {
    setLoggedInUi(false);
    setAuthStatus("尚未登入");
    state.items = [];
    browseList.innerHTML = "";
    statsGrid.innerHTML = "";
    homeSummary.innerHTML = "";
    return;
  }

  setLoggedInUi(true);
  setAuthStatus(`已登入：${session.user.email}`);
  await loadItems();
}

function validateConfig() {
  if (!config.supabaseUrl || config.supabaseUrl.includes("YOUR_PROJECT")) {
    showSetup("缺少 Supabase URL。請在 config.js 填入 supabaseUrl。");
    return false;
  }
  if (!config.supabaseAnonKey || config.supabaseAnonKey.includes("YOUR_SUPABASE_ANON_KEY")) {
    showSetup("缺少 Supabase anon key。請在 config.js 填入 supabaseAnonKey。");
    return false;
  }
  hideSetup();
  return true;
}

function attachEvents() {
  authForm.addEventListener("submit", handleSignIn);
  signUpButton.addEventListener("click", handleSignUp);
  signOutButton.addEventListener("click", async () => {
    await state.supabase.auth.signOut();
  });
  refreshButton.addEventListener("click", loadItems);
  searchInput.addEventListener("input", renderBrowseList);
  levelFilter.addEventListener("change", renderBrowseList);
  addForm.addEventListener("submit", handleAddWord);
  toggleAnswerButton.addEventListener("click", toggleReviewAnswer);
  rememberedButton.addEventListener("click", () => handleReview("remembered"));
  learningButton.addEventListener("click", () => handleReview("learning"));
  startReviewButton.addEventListener("click", () => {
    resetReviewState();
    switchTab("review");
  });

  for (const button of tabButtons) {
    button.addEventListener("click", () => switchTab(button.dataset.tab));
  }
}

async function main() {
  document.title = config.appName || "日文單字複習";

  if (!validateConfig()) {
    return;
  }

  state.supabase = createClient(config.supabaseUrl, config.supabaseAnonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true
    }
  });

  attachEvents();

  window.speechSynthesis?.getVoices?.();
  window.speechSynthesis?.addEventListener?.("voiceschanged", () => {
    window.speechSynthesis.getVoices();
  });

  const { data: { session } } = await state.supabase.auth.getSession();
  await handleSession(session);
  state.supabase.auth.onAuthStateChange(async (_event, nextSession) => {
    await handleSession(nextSession);
  });
}

main().catch((error) => {
  console.error(error);
  showSetup(`初始化失敗：${error.message}`);
});
