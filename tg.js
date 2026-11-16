/* Прослойка для Telegram Mini App.
   Обычный скрипт, не модуль: грузится до app.js и ничего не ломает в обычном браузере.
   Если telegram-web-app.js не подгрузился (открыли ссылку в Safari или Chrome), файл молча выходит. */
(function () {
  var tg = window.Telegram && window.Telegram.WebApp;
  if (!tg) return;
  /* Вне Телеграма SDK всё равно создаёт объект WebApp, но платформа у него "unknown".
     Без этой проверки прототип в обычном браузере терял боковую панель и правильную высоту. */
  if (!tg.platform || tg.platform === "unknown") return;

  var safe = function (fn) { try { fn(); } catch (e) { /* старый клиент — метода ещё нет */ } };

  safe(function () { tg.ready(); });
  safe(function () { tg.expand(); });

  /* Главное. Вертикальный свайп в Телеграме утягивает само мини-приложение вниз и закрывает его,
     а мы этим же жестом двигаем мебель и крутим комнату. Без этой строки прототип неуправляем. */
  safe(function () { tg.disableVerticalSwipes(); });

  /* Комната живёт только в памяти вкладки: случайное закрытие стёрло бы работу. */
  safe(function () { tg.enableClosingConfirmation(); });

  safe(function () { tg.setHeaderColor("#F2F2F3"); });
  safe(function () { tg.setBackgroundColor("#F2F2F3"); });

  document.documentElement.classList.add("tg");

  /* Высоту берём у Телеграма: 100dvh внутри мини-приложения врёт на часть клиентов. */
  function fit() {
    /* Выше собственного окна мини-приложение быть не может: иначе низ интерфейса
       уходит под обрез и кажется, что приложения нет вовсе. */
    var vh = tg.viewportStableHeight || tg.viewportHeight || 0;
    var win = window.innerHeight || 0;
    var h = vh > 0 ? (win > 0 ? Math.min(vh, win) : vh) : win;
    if (h > 0) document.documentElement.style.setProperty("--tgh", h + "px");
    window.dispatchEvent(new Event("resize"));
  }
  fit();
  safe(function () { tg.onEvent("viewportChanged", fit); });
  window.addEventListener("orientationchange", function () { setTimeout(fit, 250); });
})();
