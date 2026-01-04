// === КОНСТАНТЫ И ПЕРЕМЕННЫЕ ===
const AUDIO_DIR = "audio/";
const TRANSCRIPT_DIR = "transcripts/";

let audio = null;
let segments = [];
let currentAudio = null;

// === КЭШИРОВАНИЕ ===
const transcriptCache = new Map();
const audioCache = new Map();
const loadingState = new Map();

// === 1. ЗАГРУЗКА СПИСКА АУДИО ===
async function loadAudioList() {
  const listEl = document.getElementById("audioList");
  listEl.innerHTML = '<p class="warn">⏳ Поиск аудиозаписей...</p>';

  try {
    let audioFiles = [];

    // Пробуем загрузить files.txt
    try {
      const response = await fetch("files.txt");
      if (response.ok) {
        const text = await response.text();
        audioFiles = text
          .split("\n")
          .filter((line) => line.trim() && line.match(/\.(mp3|wav|ogg)$/i))
          .map((line) => line.trim());
      }
    } catch (e) {
      console.log("Использую стандартный список");
    }

    // Если не нашли файлов, используем стандартный список
    if (audioFiles.length === 0) {
      audioFiles = [
        "и_понимаете_и_этому_всему_свои_этапы.mp3",
        "он_пишет_дух_человека.mp3",
        "подожди_батюшка_дай_я_включу.mp3",
      ];
    }

    // Создаем список с адаптивными названиями
    listEl.innerHTML = audioFiles
      .map((file) => {
        const baseName = file.replace(/\.(mp3|wav|ogg)$/i, "");
        const fullName = baseName.replace(/_/g, " ");

        // Адаптируем длину названия для мобильных
        let displayName = fullName;
        const isMobile = window.innerWidth <= 768;

        if (isMobile && fullName.length > 25) {
          displayName = fullName.substring(0, 22) + "...";
        }

        const isCached = transcriptCache.has(baseName);
        const cacheIcon = isCached ? " 💾" : "";

        return `<div class="audio-item" data-filename="${file}" 
                  onclick="loadRecording('${file}')" title="${fullName}">
                  🎧 ${displayName}${cacheIcon}
                </div>`;
      })
      .join("");

    setStatus(`✅ Найдено ${audioFiles.length} аудиозаписей`, "success");
  } catch (err) {
    console.error("Ошибка:", err);
    listEl.innerHTML = `<p class="error">❌ ${err.message}</p>`;
    setStatus(`❌ Ошибка загрузки`, "error");
  }
}

// === 2. ЗАГРУЗКА АУДИОЗАПИСИ ===
async function loadRecording(audioFilename) {
  const baseName = audioFilename.replace(/\.(mp3|wav|ogg)$/i, "");

  if (loadingState.get(baseName)) return;
  loadingState.set(baseName, true);

  const audioUrl = `${AUDIO_DIR}${audioFilename}`;
  setStatus(
    `<span class="loading-indicator"></span> Загрузка: ${baseName.replace(
      /_/g,
      " "
    )}...`,
    "warn"
  );

  // Обновляем активный элемент
  document.querySelectorAll(".audio-item").forEach((el) => {
    el.classList.remove("active");
    const filename = el.getAttribute("data-filename");
    if (filename) {
      const name = filename.replace(/\.(mp3|wav|ogg)$/i, "");
      if (loadingState.get(name)) {
        el.innerHTML = el.innerHTML.replace("🎧", "⏳");
      }
    }
  });

  const activeItem = document.querySelector(
    `.audio-item[data-filename="${audioFilename}"]`
  );
  if (activeItem) {
    activeItem.classList.add("active");
    activeItem.innerHTML = activeItem.innerHTML.replace("🎧", "⏳");
  }

  try {
    // Загрузка аудио с кэшированием
    let audioObjectUrl;
    if (audioCache.has(audioUrl)) {
      console.log("Кэш аудио:", baseName);
      audioObjectUrl = audioCache.get(audioUrl);
    } else {
      const audioBlob = await fetch(audioUrl).then((r) => {
        if (!r.ok) throw new Error(`Аудио не найдено: ${r.status}`);
        return r.blob();
      });
      audioObjectUrl = URL.createObjectURL(audioBlob);
      audioCache.set(audioUrl, audioObjectUrl);
    }

    // Инициализация плеера
    if (!audio) {
      audio = new Audio();
      audio.controls = true;
      audio.style.width = "100%";
      audio.addEventListener("timeupdate", updateActiveSegment);
    }

    audio.src = audioObjectUrl;
    document.getElementById("player").innerHTML = "";
    document.getElementById("player").appendChild(audio);
    currentAudio = baseName;

    // Загрузка транскрипта с кэшированием
    if (transcriptCache.has(baseName)) {
      console.log("Кэш транскрипта:", baseName);
      segments = transcriptCache.get(baseName);
      renderTranscript();
      setStatus(
        `✅ ${baseName.replace(/_/g, " ")} (из кэша) — ${
          segments.length
        } сегментов`,
        "success"
      );
      // Перезагружаем комментарии под новую запись
      if (supabaseClient) {
        loadComments();
      }
      updateCacheIcons();
    } else {
      const transcriptData = await loadTranscriptFile(baseName);

      if (transcriptData) {
        segments = parseTranscript(transcriptData.text);
        transcriptCache.set(baseName, segments);
        console.log("Сохранено в кэш:", baseName);

        renderTranscript();
        setStatus(
          `✅ ${baseName.replace(/_/g, " ")} — ${segments.length} сегментов`,
          "success"
        );
        updateCacheIcons();
      } else {
        segments = [];
        renderTranscript();
        setStatus(`⚠️ Аудио загружено, транскрипт не найден`, "warn");
      }
    }

    // Закрываем мобильное меню после выбора
    closeMobileMenu();
  } catch (err) {
    setStatus(`❌ Ошибка: ${err.message}`, "error");
    console.error("Ошибка:", err);
  } finally {
    loadingState.set(baseName, false);
    if (activeItem && !transcriptCache.has(baseName)) {
      const displayName = audioFilename
        .replace(/\.(mp3|wav|ogg)$/i, "")
        .replace(/_/g, " ");
      activeItem.innerHTML = `🎧 ${displayName}`;
    }
  }
}

// === 3. ЗАГРУЗКА ФАЙЛА ТРАНСКРИПТА ===
async function loadTranscriptFile(baseName) {
  const extensions = [".md", ".txt"];
  const nameVariants = [baseName, baseName.replace(/_/g, " ")];

  for (const name of nameVariants) {
    for (const ext of extensions) {
      const url = `${TRANSCRIPT_DIR}${name}${ext}`;
      try {
        const response = await fetch(url);
        if (response.ok) {
          return { text: await response.text(), ext };
        }
      } catch (e) {}
    }
  }
  return null;
}

// === 4. ПАРСИНГ ТРАНСКРИПТА ===
function parseTranscript(text) {
  const startIndex = text.indexOf("### [");
  if (startIndex !== -1) text = text.slice(startIndex);

  const rawSegments = text.split(/^(?=### \[)/m).filter(Boolean);

  return rawSegments
    .map((seg, i, arr) => {
      const headerMatch = seg.match(
        /^### \[(\d{1,2}):(\d{2}):(\d{2})\]\s*(.*)/
      );
      if (!headerMatch) return null;

      const h = parseInt(headerMatch[1]) || 0;
      const m = parseInt(headerMatch[2]) || 0;
      const s = parseInt(headerMatch[3]) || 0;
      const title = headerMatch[4] || "";
      const textLines = seg
        .split("\n")
        .slice(1)
        .filter((l) => l.trim());
      const text = textLines.join("\n").trim();
      const start = h * 3600 + m * 60 + s;

      const nextMatch =
        i < arr.length - 1
          ? arr[i + 1].match(/^### \[(\d{1,2}):(\d{2}):(\d{2})\]/)
          : null;
      const end = nextMatch
        ? parseInt(nextMatch[1] || 0) * 3600 +
          parseInt(nextMatch[2] || 0) * 60 +
          parseInt(nextMatch[3] || 0)
        : start + 60;

      return { start, end, title, text };
    })
    .filter(Boolean);
}

// === 5. ВОСПРОИЗВЕДЕНИЕ СЕГМЕНТА ===
function playSegment(i) {
  const seg = segments[i];
  if (!seg || !audio) return;

  document
    .querySelectorAll(".segment")
    .forEach((el) => el.classList.remove("active"));
  const el = document.querySelectorAll(".segment")[i];
  el?.classList.add("active");

  audio.currentTime = seg.start;
  audio.play().catch((e) => {
    setStatus("▶️ Нажмите play в плеере", "warn");
  });

  el?.scrollIntoView({ behavior: "smooth", block: "center" });
}

// === 6. ОТОБРАЖЕНИЕ ТРАНСКРИПТА ===
function renderTranscript() {
  const el = document.getElementById("transcript");

  if (segments.length === 0) {
    el.innerHTML = "<p><i>Транскрипция отсутствует</i></p>";
    return;
  }

  el.innerHTML = segments
    .map((seg, i) => {
      const timeFormatted = formatTime(seg.start);
      const textHTML = seg.text
        ? `<div style="margin-top:8px;font-size:0.95em;">${seg.text.replace(
            /\n/g,
            "<br>"
          )}</div>`
        : "";

      return `<div class="segment" onclick="playSegment(${i})">
                  <div>
                    <span class="timestamp">[${timeFormatted}]</span>
                    <strong>${seg.title}</strong>
                  </div>
                  ${textHTML}
                </div>`;
    })
    .join("");
}

// === 7. ФОРМАТИРОВАНИЕ ВРЕМЕНИ ===
function formatTime(seconds) {
  seconds = Math.floor(seconds);
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;

  const pad = (num) => num.toString().padStart(2, "0");

  if (hours > 0) {
    return `${pad(hours)}:${pad(minutes)}:${pad(secs)}`;
  } else {
    return `${pad(minutes)}:${pad(secs)}`;
  }
}

// === 8. ОБНОВЛЕНИЕ СТАТУСА ===
function setStatus(message, type = "warn") {
  const el = document.getElementById("status");
  el.className = type;
  el.innerHTML = message;
}

// === 9. ПОИСК ПО ТРАНСКРИПТАМ ===
function setupSearch() {
  const searchInput = document.getElementById("searchInput");
  const clearButton = document.querySelector(".clear-search");

  if (!searchInput) return;

  searchInput.addEventListener("input", function () {
    const searchTerm = this.value.trim().toLowerCase();

    if (searchTerm === "") {
      renderTranscript();
      setStatus(`Показаны все ${segments.length} сегментов`, "success");
      return;
    }

    const filteredSegments = segments.filter(
      (seg) =>
        seg.title.toLowerCase().includes(searchTerm) ||
        seg.text.toLowerCase().includes(searchTerm)
    );

    const transcriptEl = document.getElementById("transcript");

    if (filteredSegments.length > 0) {
      transcriptEl.innerHTML = filteredSegments
        .map((seg, i) => {
          const originalIndex = segments.indexOf(seg);
          const highlight = (text) =>
            text
              ? text.replace(
                  new RegExp(`(${searchTerm})`, "gi"),
                  "<mark>$1</mark>"
                )
              : "";

          return `<div class="segment" onclick="playSegment(${originalIndex})">
                      <div>
                        <span class="timestamp">[${formatTime(
                          seg.start
                        )}]</span>
                        <strong>${highlight(seg.title)}</strong>
                      </div>
                      ${
                        seg.text
                          ? `<div style="margin-top:8px;font-size:0.95em;">${highlight(
                              seg.text.replace(/\n/g, "<br>")
                            )}</div>`
                          : ""
                      }
                    </div>`;
        })
        .join("");

      setStatus(`🔍 Найдено ${filteredSegments.length} сегментов`, "success");
    } else {
      transcriptEl.innerHTML = `<p><i>По запросу "${searchTerm}" ничего не найдено</i></p>`;
      setStatus(`🔍 Ничего не найдено`, "warn");
    }
  });

  if (clearButton) {
    clearButton.addEventListener("click", () => {
      searchInput.value = "";
      renderTranscript();
      setStatus(`Показаны все ${segments.length} сегментов`, "success");
    });
  }
}

// === 10. МОБИЛЬНОЕ МЕНЮ ===
function setupMobileMenu() {
  const toggleButton = document.getElementById("mobileMenuToggle");
  const sidebar = document.getElementById("sidebar");

  if (!toggleButton || !sidebar) return;

  toggleButton.addEventListener("click", () => {
    sidebar.classList.toggle("visible");
    const icon = toggleButton.querySelector("span");
    icon.textContent = sidebar.classList.contains("visible") ? "✕" : "☰";
  });
}

function closeMobileMenu() {
  if (window.innerWidth <= 768) {
    const sidebar = document.getElementById("sidebar");
    const toggleButton = document.getElementById("mobileMenuToggle");
    if (sidebar && toggleButton) {
      sidebar.classList.remove("visible");
      toggleButton.querySelector("span").textContent = "☰";
    }
  }
}

// === 11. УПРАВЛЕНИЕ КЭШЕМ ===
function updateCacheIcons() {
  document.querySelectorAll(".audio-item").forEach((el) => {
    const filename = el.getAttribute("data-filename");
    if (filename) {
      const baseName = filename.replace(/\.(mp3|wav|ogg)$/i, "");
      if (transcriptCache.has(baseName) && !el.innerHTML.includes("💾")) {
        el.innerHTML = el.innerHTML.replace("🎧", "🎧💾");
      }
    }
  });
}

function clearCache() {
  transcriptCache.clear();
  audioCache.forEach((url) => URL.revokeObjectURL(url));
  audioCache.clear();

  // Обновляем иконки
  document.querySelectorAll(".audio-item").forEach((el) => {
    el.innerHTML = el.innerHTML.replace("💾", "");
  });

  setStatus("✅ Кэш очищен", "success");
  console.log("Кэш очищен");
}

function showCacheInfo() {
  const info = `Транскриптов: ${transcriptCache.size}, Аудио: ${audioCache.size}`;
  setStatus(`💾 Кэш: ${info}`, "success");
  console.log("Кэш:", info);
}

// === 12. МОБИЛЬНЫЙ АККОРДЕОН ДЛЯ КОММЕНТАРИЕВ ===
function setupCommentsAccordion() {
  const toggleButton = document.getElementById("mobileCommentsToggle");
  const content = document.getElementById("mobileCommentsContent");
  const icon = toggleButton?.querySelector(".icon");

  if (toggleButton && content) {
    toggleButton.addEventListener("click", () => {
      const isExpanded = content.classList.contains("expanded");

      if (isExpanded) {
        content.classList.remove("expanded");
        icon?.classList.remove("icon-expanded");
      } else {
        content.classList.add("expanded");
        icon?.classList.add("icon-expanded");
      }
    });
  }
}

// === 13. ОБРАБОТЧИКИ СОБЫТИЙ ===
function updateActiveSegment() {
  if (!audio || segments.length === 0) return;

  const currentTime = audio.currentTime;
  document.querySelectorAll(".segment").forEach((el, i) => {
    const seg = segments[i];
    if (seg && currentTime >= seg.start && currentTime < seg.end) {
      el.classList.add("active");
    } else {
      el.classList.remove("active");
    }
  });
}

// === 14. АДАПТИВНОСТЬ ПРИ ИЗМЕНЕНИИ РАЗМЕРА ===
let resizeTimeout;
window.addEventListener("resize", () => {
  clearTimeout(resizeTimeout);
  resizeTimeout = setTimeout(() => {
    // Автоматически закрываем меню при переходе на десктоп
    if (window.innerWidth > 768) {
      closeMobileMenu();
    }
  }, 250);
});

// === 15. ЭКСПОРТ ФУНКЦИЙ ===
window.playSegment = playSegment;
window.loadRecording = loadRecording;
window.clearCache = clearCache;
window.showCacheInfo = showCacheInfo;

// === 16. ЗАПУСК ПРИЛОЖЕНИЯ ===
document.addEventListener("DOMContentLoaded", () => {
  console.log("🚀 Запуск аудиоархива...");

  loadAudioList();
  setupSearch();
  setupMobileMenu();
  setupCommentsAccordion();

  // Запуск системы комментариев после загрузки
  setTimeout(initSupabase, 500);

  // Очистка кэша при закрытии
  window.addEventListener("beforeunload", () => {
    audioCache.forEach((url) => URL.revokeObjectURL(url));
  });

  console.log("✅ Приложение запущено");
});
