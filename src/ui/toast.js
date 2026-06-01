// rad 1402–1417 exakt
let _timer = null;

export function showToast(msg, col = "#ff9900") {
  let el = document.getElementById("toast");
  if (!el) {
    el = document.createElement("div");
    el.id = "toast";
    el.style.cssText = "position:fixed;bottom:80px;left:50%;transform:translateX(-50%);padding:9px 18px;border-radius:6px;font-size:13px;font-family:monospace;z-index:200;pointer-events:none;transition:opacity .3s;white-space:nowrap;max-width:90vw;text-align:center;";
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.style.background = col + "22";
  el.style.border      = `1px solid ${col}`;
  el.style.color       = col;
  el.style.opacity     = "1";
  clearTimeout(_timer);
  _timer = setTimeout(() => { el.style.opacity = "0"; }, 3000);
}
