<!--
 * * --- МЕТКА ВЕРСИИ: v11.0-ABOUT-MODAL ---
 * * ВЕРСИЯ: 11.0 - Новое окно "О сервисе"
 * * ДАТА: 2025-11-18
 *
 * ОПИСАНИЕ:
 * Модальное окно с информацией об авторе (Эрнест Алиев),
 * контактами, соцсетями и заглушками для уроков.
 -->
<template>
  <div class="modal-overlay" @click.self="close">
    <div class="modal-content">
      <button class="close-btn" @click="close">&times;</button>
      
      <div class="modal-header">
        <h2>О сервисе</h2>
      </div>

      <div class="modal-body">
        
        <!-- Блок 1: Автор и Приветствие -->
        <div class="section author-section">
          <div class="author-info">
            <h3>Эрнест Алиев</h3>
            <p class="subtitle">Основатель и создатель</p>
            <div class="welcome-text">
              <p><strong>Приветствую вас!</strong></p>
              <p>Этот сервис создан для тех, кто хочет взять свои финансы под полный контроль. Здесь вы сможете наглядно видеть структуру своих доходов и расходов, планировать бюджет и избегать кассовых разрывов.</p>
              <p>Наша основная польза — простота и наглядность управленческого учета.</p>
              <p class="collab-text"><em>Открыт к предложениям о сотрудничестве и партнерстве.</em></p>
            </div>
          </div>
        </div>

        <!-- Блок 2: Контакты и Соцсети -->
        <div class="section contacts-section">
          <h4>Связь со мной</h4>
          
          <div class="contact-row">
            <span class="icon">📞</span>
            <div class="contact-details">
              <a href="https://wa.me/77054886698" target="_blank" class="contact-link">
                +7 705 488 66 98 (WhatsApp)
              </a>
            </div>
          </div>

          <div class="contact-row">
            <span class="icon">📧</span>
            <div class="contact-details">
              <a href="mailto:Ernestalievae@gmail.com" class="contact-link">Ernestalievae@gmail.com</a>
              <a href="mailto:ernest.aliev@mail.ru" class="contact-link">ernest.aliev@mail.ru</a>
            </div>
          </div>

          <div class="social-links">
            <a href="https://www.instagram.com/ernest_ereke" target="_blank" class="social-btn insta">
              Instagram
            </a>
            <a href="https://www.tiktok.com/@ernest_ereke" target="_blank" class="social-btn tiktok">
              TikTok
            </a>
            <a href="https://youtube.com/@ernest_ereke" target="_blank" class="social-btn youtube">
              YouTube
            </a>
          </div>
        </div>

        <!-- Блок 3: Уроки (Заглушки) -->
        <div class="section lessons-section">
          <h4>Обучающие уроки</h4>
          <div class="lessons-grid">
            <!-- 6 Заглушек -->
            <div v-for="n in 6" :key="n" class="lesson-card">
              <div class="lesson-thumbnail">
                <span class="placeholder-icon">▶</span>
                <span class="placeholder-text">Миниатюра</span>
              </div>
              <div class="lesson-info">
                <span class="lesson-title">Урок №{{ n }}: Тема урока</span>
                <span class="lesson-desc">Описание скоро появится...</span>
              </div>
            </div>
          </div>
        </div>

      </div>
      
      <div class="modal-footer">
        <button class="btn-secondary" @click="close">Закрыть</button>
      </div>
    </div>
  </div>
</template>

<script setup>
const emit = defineEmits(['close']);

function close() {
  emit('close');
}
</script>

<style scoped>
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  background: rgba(0, 0, 0, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 2000; /* Поверх всего */
  backdrop-filter: blur(2px);
}

.modal-content {
  width: 90vw;
  max-width: 800px;
  height: 85vh;
  background: var(--color-background);
  border-radius: 12px;
  border: 1px solid var(--color-border);
  box-shadow: 0 15px 40px rgba(0,0,0,0.3);
  display: flex;
  flex-direction: column;
  position: relative;
  animation: fadeIn 0.2s ease-out;
}

@keyframes fadeIn {
  from { opacity: 0; transform: translateY(10px); }
  to { opacity: 1; transform: translateY(0); }
}

.close-btn {
  position: absolute;
  top: 15px;
  right: 20px;
  background: none;
  border: none;
  font-size: 28px;
  color: var(--color-text-soft);
  cursor: pointer;
  line-height: 1;
  z-index: 10;
}
.close-btn:hover {
  color: var(--color-text);
}

.modal-header {
  padding: 20px 30px;
  border-bottom: 1px solid var(--color-border);
}

.modal-header h2 {
  margin: 0;
  font-size: 24px;
  font-weight: 600;
  color: var(--color-text);
}

.modal-body {
  flex-grow: 1;
  overflow-y: auto;
  padding: 30px;
  display: flex;
  flex-direction: column;
  gap: 30px;
}

/* --- Секции --- */
.section {
  background: var(--color-background-soft);
  padding: 20px;
  border-radius: 10px;
  border: 1px solid var(--color-border-hover);
}

h3 {
  margin: 0 0 5px 0;
  font-size: 22px;
  color: var(--color-accent);
}
h4 {
  margin: 0 0 15px 0;
  font-size: 18px;
  color: var(--color-text);
  border-bottom: 1px solid var(--color-border);
  padding-bottom: 10px;
}

.subtitle {
  color: var(--color-text-soft);
  font-size: 14px;
  margin-bottom: 15px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.welcome-text p {
  margin-bottom: 10px;
  line-height: 1.5;
  color: var(--color-text);
}
.collab-text {
  margin-top: 15px;
  color: var(--color-accent);
}

/* --- Контакты --- */
.contact-row {
  display: flex;
  align-items: flex-start;
  gap: 15px;
  margin-bottom: 15px;
}

.icon {
  font-size: 20px;
}

.contact-details {
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.contact-link {
  color: var(--color-text);
  text-decoration: none;
  font-weight: 500;
  transition: color 0.2s;
}
.contact-link:hover {
  color: var(--color-accent);
}

.social-links {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-top: 20px;
}

.social-btn {
  padding: 8px 16px;
  border-radius: 20px;
  text-decoration: none;
  font-weight: 600;
  font-size: 14px;
  transition: transform 0.2s, opacity 0.2s;
  color: white;
}
.social-btn:hover {
  transform: translateY(-2px);
  opacity: 0.9;
}

/* Цвета брендов (примерные) */
.insta { background: linear-gradient(45deg, #f09433 0%,#e6683c 25%,#dc2743 50%,#cc2366 75%,#bc1888 100%); }
.tiktok { background: #000000; border: 1px solid #333; }
.youtube { background: #FF0000; }

/* --- Сетка уроков --- */
.lessons-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 15px;
}

.lesson-card {
  background: var(--color-background);
  border: 1px solid var(--color-border);
  border-radius: 8px;
  overflow: hidden;
  transition: border-color 0.2s;
  display: flex;
  flex-direction: column;
}
.lesson-card:hover {
  border-color: var(--color-accent);
}

.lesson-thumbnail {
  height: 120px;
  background: var(--color-background-mute);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  color: var(--color-text-soft);
}
.placeholder-icon {
  font-size: 24px;
  opacity: 0.5;
}
.placeholder-text {
  font-size: 12px;
  margin-top: 5px;
}

.lesson-info {
  padding: 10px;
}
.lesson-title {
  display: block;
  font-size: 14px;
  font-weight: 600;
  margin-bottom: 4px;
  color: var(--color-text);
}
.lesson-desc {
  font-size: 12px;
  color: var(--color-text-soft);
}

/* --- Футер --- */
.modal-footer {
  padding: 15px 30px;
  border-top: 1px solid var(--color-border);
  display: flex;
  justify-content: flex-end;
}

.btn-secondary {
  padding: 10px 20px;
  border: 1px solid var(--color-border);
  background: var(--color-background-soft);
  color: var(--color-text);
  border-radius: 6px;
  cursor: pointer;
  font-size: 14px;
}
.btn-secondary:hover {
  background: var(--color-background-mute);
}
</style>
