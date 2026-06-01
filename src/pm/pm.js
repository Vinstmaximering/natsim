// PM-modul – implementeras i Fas 7.
// Tar emot projektdata via postMessage från huvudfönstret.
window.addEventListener("message", e => {
  if (e.data?.type === "natsim-pm-data") {
    console.log("PM-data mottagen:", e.data);
  }
});

export function openPM() {
  window.open("/src/pm/pm.html", "natsim-pm", "width=900,height=700");
}
