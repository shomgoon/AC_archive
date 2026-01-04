// comments.js - упрощенная и надежная версия с запоминанием имени

console.log("🚀 Инициализация системы комментариев...");

// Конфигурация Supabase
const SUPABASE_URL = "https://seaykfgsgeasjzkkjxvx.supabase.co";
const SUPABASE_KEY = "sb_publishable_CinOjeVGWkBz8NAnyFw1Mg_SzBi2INi";

// Ключ для хранения имени
const USERNAME_KEY = "audio_archive_username";

// Глобальные переменные
let supabase = null;
let currentAudioId = null;

// =================== УТИЛИТЫ ===================
function getUsername() {
  return localStorage.getItem(USERNAME_KEY) || "";
}

function saveUsername(username) {
  if (username && username.trim()) {
    localStorage.setItem(USERNAME_KEY, username.trim());
    console.log("💾 Имя сохранено:", username.trim());
  }
}

function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

function showMessage(message, type = "info") {
  console.log(type + ":", message);

  // Показываем во всех формах
  const errorDivs = document.querySelectorAll("#comment-error");
  const successDivs = document.querySelectorAll("#comment-success");

  if (type === "error") {
    errorDivs.forEach((div) => {
      if (div) {
        div.textContent = message;
        div.style.display = "block";
        setTimeout(() => (div.style.display = "none"), 5000);
      }
    });
  } else if (type === "success") {
    successDivs.forEach((div) => {
      if (div) {
        div.textContent = message;
        div.style.display = "block";
        setTimeout(() => (div.style.display = "none"), 3000);
      }
    });
  }
}

// =================== ОСНОВНЫЕ ФУНКЦИИ ===================
async function initSupabase() {
  try {
    // Проверяем, есть ли библиотека
    if (!window.supabase || !window.supabase.createClient) {
      console.error("Supabase библиотека не загружена!");
      return false;
    }

    // Создаем клиент
    supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
    console.log("✅ Supabase клиент создан");

    // Настраиваем обработчики
    setupCommentListeners();

    return true;
  } catch (error) {
    console.error("Ошибка инициализации Supabase:", error);
    return false;
  }
}

function setupCommentListeners() {
  console.log("🎯 Настройка слушателей комментариев...");

  // Слушаем клики на аудио элементах
  document.addEventListener("click", function (e) {
    const audioItem = e.target.closest(".audio-item");
    if (audioItem && audioItem.dataset.filename) {
      const baseName = audioItem.dataset.filename.replace(
        /\.(mp3|wav|ogg)$/i,
        ""
      );
      setCurrentAudio(baseName);
    }
  });
}

function setCurrentAudio(audioId) {
  if (currentAudioId === audioId) return;

  currentAudioId = audioId;
  console.log("🎯 Установлено аудио для комментариев:", currentAudioId);

  // Загружаем комментарии
  if (supabase) {
    loadComments();
  }
}

async function loadComments() {
  if (!supabase || !currentAudioId) {
    console.log("Не готово для загрузки комментариев");
    return;
  }

  console.log("📥 Загрузка комментариев для:", currentAudioId);

  try {
    const { data, error } = await supabase
      .from("comments")
      .select("*")
      .eq("audio_id", currentAudioId)
      .order("created_at", { ascending: false });

    if (error) throw error;

    displayComments(data || []);
    console.log(`✅ Загружено ${data?.length || 0} комментариев`);
  } catch (error) {
    console.error("Ошибка загрузки комментариев:", error);
    showMessage("Не удалось загрузить комментарии", "error");
  }
}

function displayComments(comments) {
  const containers = [
    document.getElementById("comments-section-desktop"),
    document.getElementById("comments-section-mobile"),
  ];

  const displayName = currentAudioId
    ? currentAudioId.replace(/_/g, " ")
    : "аудио";

  containers.forEach((container) => {
    if (!container) return;

    let html = `
        <h2 class="comments-title">💬 Комментарии к "${shortName}"</h2>
    `;
    if (!comments || comments.length === 0) {
      html += `
                <p style="color: #666; text-align: center; padding: 20px;">
                    Пока нет комментариев. Будьте первым!
                </p>
            `;
    } else {
      html += `
                <div style="margin: 15px 0;">
                    ${comments
                      .map(
                        (comment) => `
                        <div class="comment" style="border: 1px solid #eee; padding: 15px; margin: 10px 0; border-radius: 5px; background: white;">
                            <div style="display: flex; justify-content: space-between; margin-bottom: 10px;">
                                <strong>${escapeHtml(comment.username)}</strong>
                                <small style="color: #666;">
                                    ${new Date(
                                      comment.created_at
                                    ).toLocaleDateString("ru-RU")}
                                    ${new Date(
                                      comment.created_at
                                    ).toLocaleTimeString("ru-RU", {
                                      hour: "2-digit",
                                      minute: "2-digit",
                                    })}
                                </small>
                            </div>
                            <div>${escapeHtml(comment.comment)}</div>
                        </div>
                    `
                      )
                      .join("")}
                </div>
            `;
    }

    // Добавляем форму
    html += getCommentFormHTML();

    container.innerHTML = html;

    // Привязываем обработчики формы
    bindCommentForm(container);
  });
}

function getCommentFormHTML() {
  const savedName = getUsername();

  return `
        <div class="comment-form" style="background: #f5f5f5; padding: 20px; border-radius: 10px; margin: 20px 0;">
            <div id="comment-error" style="background: #f8d7da; color: #721c24; padding: 10px; border-radius: 5px; margin: 10px 0; display: none;"></div>
            <div id="comment-success" style="background: #d4edda; color: #155724; padding: 10px; border-radius: 5px; margin: 10px 0; display: none;"></div>
            
            <h3>Добавить комментарий</h3>
            <input type="text" id="comment-name" placeholder="Ваше имя" required 
                   value="${escapeHtml(savedName)}"
                   style="width: 100%; padding: 10px; margin: 5px 0; border: 1px solid #ddd; border-radius: 5px;">
            <textarea id="comment-text" placeholder="Ваш комментарий..." rows="4" required
                      style="width: 100%; padding: 10px; margin: 5px 0; border: 1px solid #ddd; border-radius: 5px;"></textarea>
            <button id="submit-comment" 
                    style="background: #4a90e2; color: white; padding: 12px 24px; border: none; border-radius: 5px; cursor: pointer;">
                Отправить комментарий
            </button>
            <div style="margin-top: 10px; font-size: 0.9em; color: #666;">
                <p>✓ Имя сохранится автоматически</p>
                <p>✓ Можно использовать Ctrl+Enter для отправки</p>
            </div>
        </div>
    `;
}

function bindCommentForm(container) {
  const submitBtn = container.querySelector("#submit-comment");
  const commentField = container.querySelector("#comment-text");

  if (submitBtn) {
    // Удаляем старые обработчики и добавляем новый
    submitBtn.replaceWith(submitBtn.cloneNode(true));
    const newSubmitBtn = container.querySelector("#submit-comment");
    newSubmitBtn.addEventListener("click", handleSubmit);
  }

  if (commentField) {
    commentField.addEventListener("keydown", function (e) {
      if (e.ctrlKey && e.key === "Enter") {
        handleSubmit(e);
      }
    });
  }
}

async function handleSubmit(event) {
  event.preventDefault();
  event.stopPropagation();

  console.log("🔄 Обработка отправки комментария...");

  if (!supabase || !currentAudioId) {
    showMessage("Выберите аудиозапись для комментирования", "error");
    return;
  }

  const button = event.target.closest("#submit-comment");
  if (!button) return;

  const form = button.closest(".comment-form");
  if (!form) {
    console.error("Форма не найдена");
    return;
  }

  const nameInput = form.querySelector("#comment-name");
  const textInput = form.querySelector("#comment-text");

  // ВАЛИДАЦИЯ
  if (!nameInput || !nameInput.value.trim()) {
    showMessage("Введите ваше имя", "error");
    nameInput?.focus();
    return;
  }

  if (!textInput || !textInput.value.trim()) {
    showMessage("Введите комментарий", "error");
    textInput?.focus();
    return;
  }

  const username = nameInput.value.trim();
  const commentText = textInput.value.trim();

  if (commentText.length > 500) {
    showMessage("Комментарий слишком длинный (макс. 500 символов)", "error");
    textInput.focus();
    return;
  }

  // СОХРАНЯЕМ ИМЯ
  saveUsername(username);

  // Показываем индикатор загрузки
  const originalText = button.textContent;
  button.disabled = true;
  button.textContent = "⏳ Отправка...";
  button.style.opacity = "0.7";

  try {
    console.log("📤 Отправка комментария для:", currentAudioId);

    const { error } = await supabase.from("comments").insert([
      {
        audio_id: currentAudioId,
        username: username,
        comment: commentText,
      },
    ]);

    if (error) throw error;

    console.log("✅ Комментарий отправлен");

    // Очищаем только поле комментария, имя оставляем
    textInput.value = "";

    // Показываем успех
    showMessage("✅ Комментарий успешно отправлен!", "success");

    // Обновляем комментарии через секунду
    setTimeout(() => {
      loadComments();
    }, 800);
  } catch (error) {
    console.error("❌ Ошибка отправки:", error);
    showMessage("❌ Ошибка отправки: " + error.message, "error");
  } finally {
    // Восстанавливаем кнопку через 2 секунды
    setTimeout(() => {
      button.disabled = false;
      button.textContent = originalText;
      button.style.opacity = "1";
    }, 2000);
  }
}

// =================== ЗАПУСК ===================
document.addEventListener("DOMContentLoaded", function () {
  console.log("🔄 Инициализация комментариев...");

  // Проверяем, подключена ли библиотека Supabase
  const checkSupabase = setInterval(() => {
    if (window.supabase) {
      clearInterval(checkSupabase);
      console.log("✅ Библиотека Supabase найдена, инициализирую...");
      initSupabase().then((success) => {
        if (success) {
          console.log("✅ Система комментариев готова к работе");
        }
      });
    }
  }, 500);

  // Таймаут на случай если библиотека не загрузится
  setTimeout(() => {
    clearInterval(checkSupabase);
    if (!window.supabase) {
      console.error("❌ Библиотека Supabase не загрузилась");
      showMessage("Система комментариев временно недоступна", "error");
    }
  }, 10000);
});

// Экспорт функций для отладки
window.commentSystem = {
  init: initSupabase,
  loadComments: loadComments,
  setAudio: setCurrentAudio,
  getUsername: getUsername,
};
