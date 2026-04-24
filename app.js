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
const reviewMinLevel = document.querySelector("#review-min-level");
const reviewMaxLevel = document.querySelector("#review-max-level");
const reviewDueOnly = document.querySelector("#review-due-only");
const reviewFilterSummary = document.querySelector("#review-filter-summary");
const reviewBatchSize = document.querySelector("#review-batch-size");
const applyReviewFilterButton = document.querySelector("#apply-review-filter-button");
const testAudioButton = document.querySelector("#test-audio-button");
const audioStatus = document.querySelector("#audio-status");
const statCardTemplate = document.querySelector("#stat-card-template");
const wordItemTemplate = document.querySelector("#word-item-template");
const tabButtons = Array.from(document.querySelectorAll(".tab-button"));
const tabPanels = Array.from(document.querySelectorAll(".tab-panel"));

const intervalsInDays = [1, 3, 7, 14, 21, 30];
const levelOrder = ["N5", "N4", "N3", "N2", "N1"];
const minimumReviewMinutes = Number(config.minimumReviewMinutes ?? 30);

const state = {
  supabase: null,
  session: null,
  items: [],
  filteredItems: [],
  reviewQueue: [],
  reviewIndex: 0,
  speechCounts: new Map(),
  currentUtterance: null,
  currentAudio: null,
  isCancellingSpeech: false
};

function nowIso() {
  return new Date().toISOString();
}

function datePlusMinutes(minutes) {
  return new Date(Date.now() + minutes * 60 * 1000).toISOString();
}

function datePlusDays(days) {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
}

function parseTimestamp(value) {
  if (!value) {
    return null;
  }
  const result = new Date(value);
  return Number.isNaN(result.getTime()) ? null : result;
}

function isDue(value) {
  const date = parseTimestamp(value);
  if (!date) {
    return true;
  }
  return date.getTime() <= Date.now();
}

function compareReviewTimes(a, b) {
  const aTime = parseTimestamp(a)?.getTime() ?? 0;
  const bTime = parseTimestamp(b)?.getTime() ?? 0;
  return aTime - bTime;
}

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

function setAudioStatus(message, isError = false) {
  audioStatus.textContent = `語音狀態：${message}`;
  audioStatus.style.color = isError ? "#b42318" : "";
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
  const index = Math.min(Math.max(reviewCount - 1, 0), intervalsInDays.length - 1);
  return intervalsInDays[index];
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

function formatReviewDate(value) {
  const date = parseTimestamp(value);
  if (!date) {
    return "未安排";
  }
  return new Intl.DateTimeFormat("zh-TW", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(date);
}

function normalizeReviewRange() {
  const minIndex = levelOrder.indexOf(reviewMinLevel.value);
  const maxIndex = levelOrder.indexOf(reviewMaxLevel.value);
  if (minIndex !== -1 && maxIndex !== -1 && minIndex > maxIndex) {
    reviewMaxLevel.value = reviewMinLevel.value;
  }
}

function levelInRange(level) {
  const itemIndex = levelOrder.indexOf(level);
  const minIndex = levelOrder.indexOf(reviewMinLevel.value);
  const maxIndex = levelOrder.indexOf(reviewMaxLevel.value);
  if (itemIndex === -1 || minIndex === -1 || maxIndex === -1) {
    return true;
  }
  return itemIndex >= minIndex && itemIndex <= maxIndex;
}

function getBatchSize() {
  const raw = Number(reviewBatchSize.value || 20);
  return Math.min(Math.max(raw, 1), 20);
}

function buildSessionQueue() {
  const dueOnly = reviewDueOnly.checked;
  return state.items
    .filter((item) => levelInRange(item.level))
    .filter((item) => (dueOnly ? isDue(item.next_review) : true))
    .sort((a, b) => compareReviewTimes(a.next_review, b.next_review) || a.id - b.id)
    .slice(0, getBatchSize())
    .map((item) => ({
      ...item,
      loopCount: 0,
      repeatedInSession: false
    }));
}

function refreshReviewSummary() {
  const dueLabel = reviewDueOnly.checked ? "只看到期單字" : "包含未到期單字";
  reviewFilterSummary.textContent =
    `目前範圍：${reviewMinLevel.value} 到 ${reviewMaxLevel.value}，${dueLabel}，本次 ${getBatchSize()} 題。`;
}

function renderStats() {
  const dueItems = state.items.filter((item) => isDue(item.next_review));
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
    node.querySelector(".stat-value").textContent = String(stat.value);
    statsGrid.appendChild(node);
  }

  const summaryLines = [
    `目前共有 ${state.items.length} 筆單字。`,
    `現在到期或尚未排程的單字有 ${dueItems.length} 筆。`,
    `複習頁可以先選等級、題數與是否只看到期單字。`
  ];
  homeSummary.innerHTML = summaryLines.map((line) => `<div class="summary-item">${line}</div>`).join("");
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
    node.querySelector(".word-title").textContent = item.jp_word || "-";
    node.querySelector(".word-reading").textContent =
      [item.jp_word1, item.jp_word2, item.romaji].filter(Boolean).join(" / ") || "尚未填寫讀音";
    node.querySelector(".word-meaning").textContent = item.zh_word || "尚未填寫中文意思";
    node.querySelector(".word-example").textContent = item.example_sentence || "尚未填寫例句";
    node.querySelector(".word-meta").textContent =
      `記憶狀態：${formatMemoryType(item.memory_type)} | 下次複習：${formatReviewDate(item.next_review)}`;
    node.querySelector(".level-pill").textContent = item.level;
    node.querySelector(".play-word-button").addEventListener("click", () => {
      void playAudioText(item.word_audio_text || item.jp_word, "單字");
    });
    node.querySelector(".play-sentence-button").addEventListener("click", () => {
      void playAudioText(item.sentence_audio_text || item.example_sentence || item.jp_word, "例句");
    });
    node.querySelector(".delete-word-button").addEventListener("click", () => {
      void deleteWord(item.id, item.jp_word);
    });
    browseList.appendChild(node);
  }
}

function renderReviewCard() {
  const item = state.reviewQueue[state.reviewIndex];
  const total = state.reviewQueue.length;
  if (!item) {
    reviewCard.classList.add("hidden");
    reviewEmpty.classList.remove("hidden");
    reviewEmpty.innerHTML = "<p>目前沒有符合這個複習範圍的單字。</p>";
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
  reviewWordAudioButton.onclick = () => {
    void playAudioText(item.word_audio_text || item.jp_word, "單字");
  };
  reviewSentenceAudioButton.onclick = () => {
    void playAudioText(item.sentence_audio_text || item.example_sentence || item.jp_word, "例句");
  };
}

function resetReviewState() {
  normalizeReviewRange();
  refreshReviewSummary();
  state.reviewQueue = buildSessionQueue();
  state.reviewIndex = 0;
  reviewAnswer.classList.add("hidden");
  toggleAnswerButton.textContent = "顯示答案";
  renderReviewCard();
}

function toggleReviewAnswer() {
  const hidden = reviewAnswer.classList.toggle("hidden");
  toggleAnswerButton.textContent = hidden ? "顯示答案" : "收起答案";
}

async function writeLearningResult(item) {
  const payload = {
    interval_days: 0,
    next_review: datePlusMinutes(minimumReviewMinutes),
    last_reviewed: nowIso()
  };
  const { error } = await state.supabase.from("vocab_items").update(payload).eq("id", item.id);
  if (error) {
    window.alert(`更新「還在學」失敗：${error.message}`);
    return false;
  }
  const index = state.items.findIndex((entry) => entry.id === item.id);
  if (index >= 0) {
    state.items[index] = { ...state.items[index], ...payload };
  }
  return true;
}

async function writeRememberedResult(item) {
  const nextReviewCount = item.review_count + 1;
  const intervalDays = getIntervalDays(nextReviewCount);
  const payload = {
    review_count: nextReviewCount,
    interval_days: intervalDays,
    memory_type: deriveMemoryType(nextReviewCount),
    next_review: datePlusDays(intervalDays),
    last_reviewed: nowIso()
  };
  const { error } = await state.supabase.from("vocab_items").update(payload).eq("id", item.id);
  if (error) {
    window.alert(`更新「記得」失敗：${error.message}`);
    return false;
  }
  const index = state.items.findIndex((entry) => entry.id === item.id);
  if (index >= 0) {
    state.items[index] = { ...state.items[index], ...payload };
  }
  return true;
}

async function handleReview(resultType) {
  const item = state.reviewQueue[state.reviewIndex];
  if (!item) {
    return;
  }

  rememberedButton.disabled = true;
  learningButton.disabled = true;

  if (resultType === "learning") {
    const ok = await writeLearningResult(item);
    rememberedButton.disabled = false;
    learningButton.disabled = false;
    if (!ok) {
      return;
    }
    state.reviewQueue.push({
      ...item,
      repeatedInSession: true,
      loopCount: (item.loopCount ?? 0) + 1,
      next_review: datePlusMinutes(minimumReviewMinutes)
    });
    state.reviewIndex += 1;
  } else {
    let ok = true;
    if (!item.repeatedInSession) {
      ok = await writeRememberedResult(item);
    }
    rememberedButton.disabled = false;
    learningButton.disabled = false;
    if (!ok) {
      return;
    }
    state.reviewIndex += 1;
  }

  reviewAnswer.classList.add("hidden");
  toggleAnswerButton.textContent = "顯示答案";
  renderStats();
  renderBrowseList();
  renderReviewCard();
}

function wait(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

async function loadVoices() {
  if (!("speechSynthesis" in window)) {
    return [];
  }
  const synth = window.speechSynthesis;
  const voices = synth.getVoices();
  if (voices.length) {
    return voices;
  }
  return new Promise((resolve) => {
    const timeoutId = window.setTimeout(() => resolve(synth.getVoices()), 1000);
    const handleVoices = () => {
      window.clearTimeout(timeoutId);
      synth.removeEventListener("voiceschanged", handleVoices);
      resolve(synth.getVoices());
    };
    synth.addEventListener("voiceschanged", handleVoices, { once: true });
  });
}

function pickJapaneseVoice(voices) {
  const preferred = ["Microsoft Haruka", "Google 日本語", "Kyoko", "Otoya"];
  for (const name of preferred) {
    const match = voices.find((voice) => voice.name.includes(name));
    if (match) {
      return match;
    }
  }
  return voices.find((voice) => voice.lang?.toLowerCase().startsWith("ja")) || null;
}

async function stopCurrentAudio() {
  if (state.currentAudio) {
    state.currentAudio.pause();
    state.currentAudio.currentTime = 0;
    state.currentAudio = null;
  }
  if ("speechSynthesis" in window) {
    state.isCancellingSpeech = true;
    window.speechSynthesis.cancel();
    await wait(80);
    state.isCancellingSpeech = false;
  }
}

function getGeminiTtsUrl(text, slow) {
  if (!config.geminiTtsBaseUrl) {
    return null;
  }
  const url = new URL("/api/tts", config.geminiTtsBaseUrl);
  url.searchParams.set("text", text);
  url.searchParams.set("voice", config.geminiTtsVoice || "Kore");
  url.searchParams.set("slow", slow ? "true" : "false");
  return url.toString();
}

async function playGeminiAudio(text, label, slow) {
  const targetUrl = getGeminiTtsUrl(text, slow);
  if (!targetUrl) {
    return false;
  }

  setAudioStatus(`正在向 Gemini 取得${label}音檔...`);
  const response = await fetch(targetUrl, { method: "GET" });
  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    const message = payload?.error || `HTTP ${response.status}`;
    throw new Error(message);
  }

  const blob = await response.blob();
  const objectUrl = URL.createObjectURL(blob);
  const audio = new Audio(objectUrl);
  state.currentAudio = audio;
  audio.onplay = () => {
    setAudioStatus(`正在播放${label}${slow ? "（慢速）" : ""}，來源：Gemini 快取音檔`);
  };
  audio.onended = () => {
    setAudioStatus(`播放完成：${label}`);
    URL.revokeObjectURL(objectUrl);
    if (state.currentAudio === audio) {
      state.currentAudio = null;
    }
  };
  audio.onerror = () => {
    URL.revokeObjectURL(objectUrl);
    if (state.currentAudio === audio) {
      state.currentAudio = null;
    }
  };
  await audio.play();
  return true;
}

async function playBrowserSpeech(text, label, slow) {
  if (!("speechSynthesis" in window)) {
    throw new Error("這個瀏覽器不支援語音播放。");
  }
  const voices = await loadVoices();
  const voice = pickJapaneseVoice(voices);
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = "ja-JP";
  utterance.rate = slow ? Number(config.slowPlaybackRate ?? 0.6) : Number(config.normalPlaybackRate ?? 0.95);
  utterance.pitch = 1;
  utterance.volume = 1;
  if (voice) {
    utterance.voice = voice;
  }
  utterance.onstart = () => {
    setAudioStatus(`正在播放${label}${slow ? "（慢速）" : ""}，來源：瀏覽器語音`);
  };
  utterance.onend = () => {
    setAudioStatus(`播放完成：${label}`);
  };
  utterance.onerror = (event) => {
    if (state.isCancellingSpeech || ["interrupted", "canceled"].includes(event.error)) {
      return;
    }
    setAudioStatus(`播放失敗：${label}`, true);
  };
  state.currentUtterance = utterance;
  window.speechSynthesis.speak(utterance);
  window.speechSynthesis.resume();
}

async function playAudioText(rawText, label = "語音") {
  const text = String(rawText || "").trim();
  if (!text) {
    setAudioStatus("沒有可播放的文字。", true);
    return;
  }

  const currentCount = (state.speechCounts.get(text) ?? 0) + 1;
  state.speechCounts.set(text, currentCount);
  const slow = currentCount % 3 === 0;

  await stopCurrentAudio();

  if (config.preferGeminiTts && config.geminiTtsBaseUrl) {
    try {
      const ok = await playGeminiAudio(text, label, slow);
      if (ok) {
        return;
      }
    } catch (error) {
      console.error(error);
      setAudioStatus(`Gemini 音檔失敗，改用瀏覽器語音：${error.message}`, true);
    }
  }

  try {
    await playBrowserSpeech(text, label, slow);
  } catch (error) {
    console.error(error);
    setAudioStatus(`語音播放失敗：${error.message}`, true);
  }
}

async function deleteWord(id, label) {
  const shouldDelete = window.confirm(`確定要刪除「${label}」嗎？`);
  if (!shouldDelete) {
    return;
  }
  const { error } = await state.supabase.from("vocab_items").delete().eq("id", id);
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
  setAuthStatus("註冊完成，如果有開 Email 驗證，請先去信箱完成驗證。");
}

async function handleAddWord(event) {
  event.preventDefault();
  if (!state.session?.user?.id) {
    window.alert("請先登入。");
    return;
  }

  const formData = new FormData(addForm);
  const jpWord = String(formData.get("jp_word") || "").trim();
  const exampleSentence = String(formData.get("example_sentence") || "").trim();

  const payload = {
    owner_id: state.session.user.id,
    jp_word: jpWord,
    jp_word1: String(formData.get("jp_word1") || "").trim() || null,
    jp_word2: String(formData.get("jp_word2") || "").trim() || null,
    romaji: String(formData.get("romaji") || "").trim() || null,
    zh_word: String(formData.get("zh_word") || "").trim() || null,
    example_sentence: exampleSentence || null,
    example_hiragana: String(formData.get("example_hiragana") || "").trim() || null,
    example_zh: String(formData.get("example_zh") || "").trim() || null,
    word_audio_text: jpWord || null,
    sentence_audio_text: exampleSentence || null,
    level: String(formData.get("level") || config.defaultLevel || "N5"),
    review_count: 0,
    interval_days: 0,
    memory_type: "new",
    next_review: nowIso(),
    last_reviewed: null
  };

  const { data, error } = await state.supabase.from("vocab_items").insert(payload).select().single();
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
    showSetup("缺少 Supabase URL，請在 config.js 填入 supabaseUrl。");
    return false;
  }
  if (!config.supabaseAnonKey || config.supabaseAnonKey.includes("YOUR_SUPABASE_ANON_KEY")) {
    showSetup("缺少 Supabase anon key，請在 config.js 填入 supabaseAnonKey。");
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
  rememberedButton.addEventListener("click", () => void handleReview("remembered"));
  learningButton.addEventListener("click", () => void handleReview("learning"));
  startReviewButton.addEventListener("click", () => {
    switchTab("review");
    resetReviewState();
  });
  applyReviewFilterButton.addEventListener("click", resetReviewState);
  reviewMinLevel.addEventListener("change", () => {
    normalizeReviewRange();
    refreshReviewSummary();
  });
  reviewMaxLevel.addEventListener("change", () => {
    normalizeReviewRange();
    refreshReviewSummary();
  });
  reviewDueOnly.addEventListener("change", refreshReviewSummary);
  reviewBatchSize.addEventListener("change", refreshReviewSummary);
  testAudioButton.addEventListener("click", () => {
    void playAudioText("こんにちは。日本語の音声テストです。", "測試語音");
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
  refreshReviewSummary();
  setAudioStatus(config.preferGeminiTts ? "待命中，優先使用 Gemini 音檔" : "待命中，使用瀏覽器語音");

  const {
    data: { session }
  } = await state.supabase.auth.getSession();

  await handleSession(session);
  state.supabase.auth.onAuthStateChange(async (_event, nextSession) => {
    await handleSession(nextSession);
  });
}

main().catch((error) => {
  console.error(error);
  showSetup(`初始化失敗：${error.message}`);
});
