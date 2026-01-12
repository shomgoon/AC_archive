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

// === ИНДЕКС ЗАГОЛОВКОВ ===
let headerIndex = []; // Массив {audioFile, baseName, title, start, segmentIndex}

// === 1. ЗАГРУЗКА СПИСКА АУДИО (ОБНОВЛЕННАЯ) ===
// === 1. ЗАГРУЗКА СПИСКА АУДИО (ОБНОВЛЕННАЯ) ===
async function loadAudioList() {
  const listEl = document.getElementById("audioList");
  listEl.innerHTML = '<p class="warn">⏳ Поиск аудиозаписей...</p>';

  try {
    let audioFiles = [];
    let usingDefaultList = false;

    // Пробуем загрузить files.txt
    try {
      const response = await fetch("files.txt");
      if (response.ok) {
        const text = await response.text();
        console.log("📄 Содержимое files.txt:", text);

        audioFiles = text
          .split("\n")
          .filter((line) => {
            const trimmed = line.trim();
            return trimmed && trimmed.match(/\.(mp3|wav|ogg)$/i);
          })
          .map((line) => line.trim());

        console.log("✅ Файлов из files.txt:", audioFiles.length);
      } else {
        console.log("❌ files.txt не найден или ошибка загрузки");
      }
    } catch (e) {
      console.log("⚠️ Ошибка загрузки files.txt:", e.message);
    }

    // Если не нашли файлов, используем стандартный список
    if (audioFiles.length === 0) {
      usingDefaultList = true;
      audioFiles = [
        "и_понимаете_и_этому_всему_свои_этапы.mp3",
        "он_пишет_дух_человека.mp3",
        "подожди_батюшка_дай_я_включу.mp3",
      ];
      console.log(
        "🔧 Использую стандартный список из",
        audioFiles.length,
        "файлов"
      );
    }

    // ========== ПОЛУЧАЕМ ДЛИТЕЛЬНОСТИ ==========
    console.log("⏳ Загружаю длительности для", audioFiles.length, "файлов...");

    // Создаем массив промисов для загрузки длительностей
    const durationPromises = audioFiles.map(async (file) => {
      const audioUrl = `${AUDIO_DIR}${file}`;
      console.log("📥 Проверяю файл:", audioUrl);

      try {
        // Сначала проверяем доступность файла
        const response = await fetch(audioUrl, { method: "HEAD" });
        if (!response.ok) {
          console.warn(`❌ Файл недоступен: ${file} (${response.status})`);
          return { file, duration: 0, error: `HTTP ${response.status}` };
        }

        const duration = await getAudioDuration(audioUrl);
        console.log(`✅ ${file}: ${formatDuration(duration)}`);
        return { file, duration };
      } catch (error) {
        console.warn(`⚠️ Ошибка для ${file}:`, error.message);
        return { file, duration: 0, error: error.message };
      }
    });

    // Ждем загрузки всех длительностей
    const filesWithDurations = await Promise.all(durationPromises);

    // Фильтруем только доступные файлы
    const availableFiles = filesWithDurations.filter(
      (item) => item.duration > 0 || !item.error
    );

    if (availableFiles.length === 0) {
      listEl.innerHTML =
        '<p class="error">❌ Не найдено доступных аудиофайлов</p>';
      setStatus("❌ Аудиофайлы не найдены", "error");
      return;
    }

    // Создаем объект для быстрого доступа: имя файла -> длительность
    const durationMap = {};
    availableFiles.forEach(({ file, duration }) => {
      durationMap[file] = duration;
    });

    console.log("✅ Длительности загружены:", durationMap);
    console.log(
      "📊 Доступных файлов:",
      availableFiles.length,
      "из",
      audioFiles.length
    );
    console.log(
      "📁 Список файлов:",
      availableFiles.map((f) => f.file)
    );

    // Создаем список с адаптивными названиями И ДЛИТЕЛЬНОСТЬЮ
    listEl.innerHTML = availableFiles
      .map(({ file }) => {
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

        // Форматируем длительность
        const duration = durationMap[file] || 0;
        let durationHtml = "";

        if (duration > 0) {
          const formattedDuration = formatDuration(duration);
          durationHtml = `<span class="audio-duration" title="Длительность: ${formattedDuration}">${formattedDuration}</span>`;
        } else {
          durationHtml = `<span class="audio-duration unknown" title="Длительность недоступна">--:--:--</span>`;
        }

        return `<div class="audio-item" data-filename="${file}" 
                  onclick="loadRecording('${file}')" title="${fullName}">
                  <div class="audio-item-content">
                    <span class="audio-icon">🎧</span>
                    <span class="audio-name">${displayName}${cacheIcon}</span>
                    ${durationHtml}
                  </div>
                </div>`;
      })
      .join("");

    setStatus(
      `✅ Найдено ${availableFiles.length} аудиозаписей${
        usingDefaultList ? " (стандартный список)" : ""
      }`,
      "success"
    );
  } catch (err) {
    console.error("❌ Критическая ошибка:", err);
    listEl.innerHTML = `<p class="error">❌ ${err.message}</p>`;
    setStatus(`❌ Ошибка загрузки: ${err.message}`, "error");
  }
}

// ========== НОВАЯ ФУНКЦИЯ: Получение длительности аудио ==========
async function getAudioDuration(audioUrl) {
  return new Promise((resolve, reject) => {
    const audio = new Audio();

    audio.addEventListener("loadedmetadata", () => {
      if (audio.duration && audio.duration !== Infinity) {
        resolve(audio.duration);
      } else {
        reject(new Error("Не удалось определить длительность"));
      }
      // Очищаем ссылку на объект
      audio.src = "";
    });

    audio.addEventListener("error", (e) => {
      reject(
        new Error(
          `Ошибка загрузки: ${e.target.error?.message || "неизвестная ошибка"}`
        )
      );
      audio.src = "";
    });

    // Устанавливаем таймаут на случай зависания
    const timeout = setTimeout(() => {
      audio.src = "";
      reject(new Error("Таймаут загрузки"));
    }, 10000); // 10 секунд

    audio.addEventListener("loadedmetadata", () => clearTimeout(timeout), {
      once: true,
    });
    audio.addEventListener("error", () => clearTimeout(timeout), {
      once: true,
    });

    audio.src = audioUrl;
  });
}

// ========== НОВАЯ ФУНКЦИЯ: Форматирование длительности ==========
function formatDuration(seconds) {
  // Убеждаемся, что seconds - это число
  seconds = Number(seconds);
  if (!seconds || seconds === 0 || isNaN(seconds)) return "0:00:00";
  
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  
  const pad = (num) => num.toString().padStart(2, "0");
  
  // Всегда возвращаем формат часы:минуты:секунды
  return `${pad(hours)}:${pad(minutes)}:${pad(secs)}`;
}

// === 2. ЗАГРУЗКА АУДИОЗАПИСИ ===
async function loadRecording(audioFilename) {
  const baseName = audioFilename.replace(/\.(mp3|wav|ogg)$/i, "");

  // Обновляем текущую запись для комментариев
  if (typeof updateCurrentAudio === "function") {
    updateCurrentAudio(audioFilename);
  }

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
    // Меняем иконку на время загрузки
    const audioIcon = activeItem.querySelector(".audio-icon");
    if (audioIcon) audioIcon.textContent = "⏳";
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
    if (activeItem) {
      // Восстанавливаем иконку
      const audioIcon = activeItem.querySelector(".audio-icon");
      if (audioIcon) audioIcon.textContent = "🎧";

      // Обновляем иконку кэша если нужно
      if (transcriptCache.has(baseName)) {
        const audioName = activeItem.querySelector(".audio-name");
        if (audioName && !audioName.textContent.includes("💾")) {
          audioName.textContent += " 💾";
        }
      }
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

// === 7. ФОРМАТИРОВАНИЕ ВРЕМЕНИ (общая функция) ===
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

// === 8.1. ПОСТРОЕНИЕ ИНДЕКСА ЗАГОЛОВКОВ ===
async function buildHeaderIndex() {
  setStatus("⏳ Построение индекса заголовков...", "warn");
  
  try {
    // Получаем список аудиофайлов
    let audioFiles = [];
    try {
      const response = await fetch("files.txt");
      if (response.ok) {
        const text = await response.text();
        audioFiles = text
          .split("\n")
          .filter((line) => {
            const trimmed = line.trim();
            return trimmed && trimmed.match(/\.(mp3|wav|ogg)$/i);
          })
          .map((line) => line.trim());
      }
    } catch (e) {
      console.log("⚠️ Ошибка загрузки files.txt:", e.message);
    }

    // Если не нашли файлов, используем стандартный список
    if (audioFiles.length === 0) {
      audioFiles = [
        "и_понимаете_и_этому_всему_свои_этапы.mp3",
        "он_пишет_дух_человека.mp3",
        "подожди_батюшка_дай_я_включу.mp3",
        "мои_дорогие_учимся_слушать_тишину.mp3",
        "телевизор_включаешь_ли_смартфон.mp3",
      ];
    }

    headerIndex = [];
    
    // Загружаем заголовки из всех транскриптов
    const indexPromises = audioFiles.map(async (audioFile) => {
      const baseName = audioFile.replace(/\.(mp3|wav|ogg)$/i, "");
      const transcriptData = await loadTranscriptFile(baseName);
      
      if (transcriptData) {
        // Парсим только заголовки без полного текста
        const headers = parseHeadersOnly(transcriptData.text);
        headers.forEach((header, segmentIndex) => {
          headerIndex.push({
            audioFile,
            baseName,
            title: header.title,
            start: header.start,
            segmentIndex
          });
        });
      }
    });

    await Promise.all(indexPromises);
    
    console.log(`✅ Индекс построен: ${headerIndex.length} заголовков из ${audioFiles.length} файлов`);
    setStatus(`✅ Индекс готов: ${headerIndex.length} заголовков`, "success");
  } catch (err) {
    console.error("❌ Ошибка построения индекса:", err);
    setStatus("⚠️ Ошибка построения индекса", "error");
  }
}

// === 8.2. ПАРСИНГ ТОЛЬКО ЗАГОЛОВКОВ (без текста) ===
function parseHeadersOnly(text) {
  const startIndex = text.indexOf("### [");
  if (startIndex !== -1) text = text.slice(startIndex);

  const rawSegments = text.split(/^(?=### \[)/m).filter(Boolean);

  return rawSegments
    .map((seg) => {
      const headerMatch = seg.match(
        /^### \[(\d{1,2}):(\d{2}):(\d{2})\]\s*(.*)/
      );
      if (!headerMatch) return null;

      const h = parseInt(headerMatch[1]) || 0;
      const m = parseInt(headerMatch[2]) || 0;
      const s = parseInt(headerMatch[3]) || 0;
      const title = headerMatch[4] || "";
      const start = h * 3600 + m * 60 + s;

      return { start, title };
    })
    .filter(Boolean);
}

// === 8.3. ПЕРЕХОД К СЕГМЕНТУ ИЗ РЕЗУЛЬТАТОВ ПОИСКА ===
async function navigateToSegment(audioFile, segmentIndex) {
  try {
    // Загружаем аудио и транскрипт если они еще не загружены
    const baseName = audioFile.replace(/\.(mp3|wav|ogg)$/i, "");
    
    if (currentAudio !== baseName) {
      setStatus("⏳ Загрузка транскрипта...", "warn");
      await loadRecording(audioFile);
    }
    
    // Ждем, пока транскрипт загрузится (проверяем несколько раз)
    let attempts = 0;
    while (segments.length === 0 && attempts < 20) {
      await new Promise(resolve => setTimeout(resolve, 100));
      attempts++;
    }
    
    // Переходим к нужному сегменту
    if (segments.length > segmentIndex && segmentIndex >= 0) {
      playSegment(segmentIndex);
      // Показываем полный транскрипт после перехода
      renderTranscript();
      setStatus(`✅ Переход к сегменту: ${segments[segmentIndex].title}`, "success");
    } else {
      setStatus(`⚠️ Сегмент не найден (индекс: ${segmentIndex})`, "warn");
    }
  } catch (err) {
    console.error("Ошибка перехода к сегменту:", err);
    setStatus(`❌ Ошибка: ${err.message}`, "error");
  }
}

// === 9. ПОИСК ПО ИНДЕКСУ ЗАГОЛОВКОВ ===
function setupSearch() {
  const searchInput = document.getElementById("searchInput");
  const clearButton = document.querySelector(".clear-search");

  if (!searchInput) return;

  searchInput.addEventListener("input", function () {
    const searchTerm = this.value.trim().toLowerCase();

    if (searchTerm === "") {
      // Если транскрипт загружен, показываем его, иначе очищаем
      if (segments.length > 0) {
        renderTranscript();
        setStatus(`Показаны все ${segments.length} сегментов`, "success");
      } else {
        const transcriptEl = document.getElementById("transcript");
        transcriptEl.innerHTML = "";
        setStatus("Выберите запись из списка", "warn");
      }
      return;
    }

    // Поиск по индексу заголовков
    const filteredHeaders = headerIndex.filter((item) =>
      item.title.toLowerCase().includes(searchTerm)
    );

    const transcriptEl = document.getElementById("transcript");

    if (filteredHeaders.length > 0) {
      const highlight = (text) =>
        text
          ? text.replace(
              new RegExp(`(${searchTerm})`, "gi"),
              "<mark>$1</mark>"
            )
          : "";

      transcriptEl.innerHTML = filteredHeaders
        .map((item) => {
          const audioDisplayName = item.baseName.replace(/_/g, " ");
          const timeFormatted = formatTime(item.start);
          
          return `<div class="segment search-result" 
                      onclick="navigateToSegment('${item.audioFile}', ${item.segmentIndex})"
                      style="cursor: pointer;">
                      <div>
                        <div style="font-size: 0.85em; color: #666; margin-bottom: 4px;">
                          📁 ${audioDisplayName}
                        </div>
                        <span class="timestamp">[${timeFormatted}]</span>
                        <strong>${highlight(item.title)}</strong>
                      </div>
                    </div>`;
        })
        .join("");

      setStatus(`🔍 Найдено ${filteredHeaders.length} заголовков`, "success");
    } else {
      transcriptEl.innerHTML = `<p><i>По запросу "${searchTerm}" ничего не найдено</i></p>`;
      setStatus(`🔍 Ничего не найдено`, "warn");
    }
  });

  if (clearButton) {
    clearButton.addEventListener("click", () => {
      searchInput.value = "";
      if (segments.length > 0) {
        renderTranscript();
        setStatus(`Показаны все ${segments.length} сегментов`, "success");
      } else {
        const transcriptEl = document.getElementById("transcript");
        transcriptEl.innerHTML = "";
        setStatus("Выберите запись из списка", "warn");
      }
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
      if (transcriptCache.has(baseName)) {
        const audioName = el.querySelector(".audio-name");
        if (audioName && !audioName.textContent.includes("💾")) {
          audioName.textContent += " 💾";
        }
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
    const audioName = el.querySelector(".audio-name");
    if (audioName) {
      audioName.textContent = audioName.textContent.replace(" 💾", "");
    }
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
window.navigateToSegment = navigateToSegment;

// === 16. ЗАПУСК ПРИЛОЖЕНИЯ ===
document.addEventListener("DOMContentLoaded", () => {
  console.log("🚀 Запуск аудиоархива...");

  loadAudioList();
  buildHeaderIndex(); // Строим индекс заголовков при загрузке
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
