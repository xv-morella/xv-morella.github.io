(function () {
  const cfg = window.INVITACION_CONFIG;
  if (!cfg) return;

  const $ = (id) => document.getElementById(id);

  const toIcsUtc = (d) => {
    const pad = (n) => String(n).padStart(2, "0");
    return (
      d.getUTCFullYear() +
      pad(d.getUTCMonth() + 1) +
      pad(d.getUTCDate()) +
      "T" +
      pad(d.getUTCHours()) +
      pad(d.getUTCMinutes()) +
      pad(d.getUTCSeconds()) +
      "Z"
    );
  };

  const downloadTextFile = (filename, content, mime) => {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const csvEscape = (value) => {
    const s = String(value ?? "");
    if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };

  const downloadCsv = (filename, headers, rows) => {
    const head = headers.map(csvEscape).join(",");
    const body = rows
      .map((r) => headers.map((h) => csvEscape(r[h])).join(","))
      .join("\n");
    const csv = [head, body].filter(Boolean).join("\n");
    downloadTextFile(filename, csv, "text/csv;charset=utf-8");
  };

  const readJsonArray = (key) => {
    try {
      const raw = localStorage.getItem(key);
      const data = raw ? JSON.parse(raw) : [];
      return Array.isArray(data) ? data : [];
    } catch {
      return [];
    }
  };

  const writeJsonArray = (key, arr) => {
    localStorage.setItem(key, JSON.stringify(arr));
  };

  const postToSheets = async (payload) => {
    const url = cfg.sheets?.webAppUrl;
    if (!url) return { ok: false, skipped: true };
    const body = new URLSearchParams();
    body.set("payload", JSON.stringify(payload));

    const isGoogleAppsScript = /https:\/\/script\.google\.com\/macros\/s\//.test(url);

    const isLocal =
      window.location.protocol === "file:" ||
      window.location.hostname === "localhost" ||
      window.location.hostname === "127.0.0.1";

    if (isGoogleAppsScript || isLocal) {
      try {
        await fetch(url, {
          method: "POST",
          mode: "no-cors",
          body,
        });
        return { ok: true, unverified: true };
      } catch (err) {
        return { ok: false, err };
      }
    }

    // 1) Try a verifiable request (preferred)
    try {
      const res = await fetch(url, {
        method: "POST",
        mode: "cors",
        body,
      });

      if (!res.ok) {
        return { ok: false, status: res.status };
      }

      const text = await res.text();
      try {
        const data = JSON.parse(text);
        if (data && typeof data === "object") return data;
        return { ok: false, error: "invalid_response" };
      } catch {
        return { ok: false, error: "invalid_json" };
      }
    } catch (err) {
      // If CORS blocks reading the response, fallback to no-cors.
      try {
        await fetch(url, {
          method: "POST",
          mode: "no-cors",
          body,
        });
        return { ok: true, unverified: true };
      } catch (err2) {
        return { ok: false, err: err2 ?? err };
      }
    }
  };

  document.title = cfg.hero?.name ? `Invitación - ${cfg.hero.name}` : "Invitación";

  const root = document.documentElement;
  if (cfg.theme?.primaryButton) root.style.setProperty("--btn", cfg.theme.primaryButton);
  if (cfg.theme?.primaryButtonText) root.style.setProperty("--btnText", cfg.theme.primaryButtonText);

  if (cfg.theme?.backgroundImage) {
    const heroBg = document.querySelector(".hero__bg");
    if (heroBg) {
      heroBg.style.backgroundImage =
        `linear-gradient(180deg, rgba(0,0,0,0.25), rgba(0,0,0,0.65)), ` +
        `radial-gradient(1200px 900px at 50% 0%, rgba(255,255,255,0.20), transparent 60%), ` +
        `url('${cfg.theme.backgroundImage}')`;
    }
  }

  if (cfg.hero?.kicker) $("heroKicker").textContent = cfg.hero.kicker;
  if (cfg.hero?.name) $("heroName").textContent = cfg.hero.name;
  if (cfg.hero?.dateShort) $("heroDate").textContent = cfg.hero.dateShort;
  if (cfg.hero?.quote) $("heroQuote").textContent = cfg.hero.quote;

  if (cfg.event?.whenTitle) $("whenTitle").textContent = cfg.event.whenTitle;
  if (cfg.event?.dayName) $("whenDayName").textContent = cfg.event.dayName;
  if (cfg.event?.dateLong) $("whenDateLong").textContent = cfg.event.dateLong;
  if (cfg.event?.time) $("whenTime").textContent = cfg.event.time;

  if (cfg.event?.calendarLabel) $("calendarLink").textContent = cfg.event.calendarLabel;
  const calendarLink = $("calendarLink");
  if (calendarLink) {
    calendarLink.href = "#";
    calendarLink.addEventListener("click", (e) => {
      e.preventDefault();
      const startIso = cfg.event?.start;
      const start = startIso ? new Date(startIso) : null;
      if (!start || Number.isNaN(start.getTime())) return;

      const durationMinutes = Number(cfg.event?.durationMinutes ?? 360);
      const end = new Date(start.getTime() + Math.max(0, durationMinutes) * 60 * 1000);

      const title = cfg.event?.calendarTitle || (cfg.hero?.name ? `XV de ${cfg.hero.name}` : "Evento");
      const description = cfg.event?.calendarDescription || "";
      const location = [cfg.venue?.name, cfg.venue?.address].filter(Boolean).join(" - ");
      const uid = `${start.getTime()}-${Math.random().toString(16).slice(2)}@invitacion`;

      const ics =
        "BEGIN:VCALENDAR\r\n" +
        "VERSION:2.0\r\n" +
        "PRODID:-//Invitacion//ES\r\n" +
        "CALSCALE:GREGORIAN\r\n" +
        "METHOD:PUBLISH\r\n" +
        "BEGIN:VEVENT\r\n" +
        `UID:${uid}\r\n` +
        `DTSTAMP:${toIcsUtc(new Date())}\r\n` +
        `DTSTART:${toIcsUtc(start)}\r\n` +
        `DTEND:${toIcsUtc(end)}\r\n` +
        `SUMMARY:${String(title).replace(/\n/g, " ")}\r\n` +
        `DESCRIPTION:${String(description).replace(/\n/g, "\\n")}\r\n` +
        `LOCATION:${String(location).replace(/\n/g, " ")}\r\n` +
        "END:VEVENT\r\n" +
        "END:VCALENDAR\r\n";

      downloadTextFile("evento.ics", ics, "text/calendar;charset=utf-8");
    });
  }

  if (cfg.venue?.title) $("whereTitle").textContent = cfg.venue.title;
  if (cfg.venue?.name) $("venueName").textContent = cfg.venue.name;
  if (cfg.venue?.address) $("venueAddress").textContent = cfg.venue.address;

  if (cfg.venue?.mapsUrl) {
    $("mapsLink").href = cfg.venue.mapsUrl;
  } else {
    $("mapsLink").style.display = "none";
  }

  const embed = $("mapsEmbed");
  const mapsEmbedUrl = cfg.venue?.mapsEmbedUrl || "";
  if (embed) {
    if (mapsEmbedUrl) embed.src = mapsEmbedUrl;
    else embed.closest(".panel--map").style.display = "none";
  }

  if (cfg.rsvp?.title) $("rsvpTitle").textContent = cfg.rsvp.title;
  if (cfg.rsvp?.text) $("rsvpText").textContent = cfg.rsvp.text;

  if (cfg.menu?.title) $("menuTitle").textContent = cfg.menu.title;
  if (cfg.menu?.text) $("menuText").textContent = cfg.menu.text;

  if (cfg.dresscode?.title) $("dressTitle").textContent = cfg.dresscode.title;
  if (cfg.dresscode?.value) $("dressValue").textContent = cfg.dresscode.value;

  if (cfg.playlist?.title) $("playlistTitle").textContent = cfg.playlist.title;
  if (cfg.playlist?.text) $("playlistText").textContent = cfg.playlist.text;
  if (cfg.playlist?.whatsappUrl) {
    $("playlistLink").href = cfg.playlist.whatsappUrl;
  } else {
    $("playlistLink").style.display = "none";
  }
  if (cfg.playlist?.buttonLabel) $("playlistLink").textContent = cfg.playlist.buttonLabel;

  const RSVP_KEY = "invitacion_rsvp";
  const MENU_KEY = "invitacion_menu";

  const rsvpForm = $("rsvpForm");
  const rsvpStatus = $("rsvpStatus");
  const exportRsvp = $("exportRsvp");
  if (rsvpForm) {
    rsvpForm.addEventListener("submit", (e) => {
      e.preventDefault();
      const form = new FormData(rsvpForm);
      const name = String(form.get("name") || "").trim();
      const status = String(form.get("status") || "").trim();
      if (!name || !status) return;

      const row = {
        ts: new Date().toISOString(),
        name,
        status,
      };

      const rows = readJsonArray(RSVP_KEY);
      rows.push(row);
      writeJsonArray(RSVP_KEY, rows);
      if (rsvpStatus) rsvpStatus.textContent = "Enviando...";

      Promise.resolve()
        .then(() => postToSheets({ type: "rsvp", ...row }))
        .then((res) => {
          rsvpForm.reset();
          if (!rsvpStatus) return;
          if (res?.skipped) {
            rsvpStatus.textContent = "¡Listo! Tu respuesta quedó registrada.";
            return;
          }
          if (res?.unverified) {
            rsvpStatus.textContent = "Enviado. Si no aparece en la planilla en unos segundos, reintentá.";
            return;
          }
          if (res?.ok) {
            rsvpStatus.textContent = "¡Listo! Tu respuesta quedó registrada.";
            return;
          }
          rsvpStatus.textContent = "Guardado en el dispositivo, pero falló el envío a la planilla.";
        })
        .catch(() => {
          rsvpForm.reset();
          if (rsvpStatus) rsvpStatus.textContent = "Guardado en el dispositivo, pero falló el envío a la planilla.";
        });
    });
  }

  if (exportRsvp) {
    exportRsvp.addEventListener("click", () => {
      const rows = readJsonArray(RSVP_KEY);
      downloadCsv(
        "rsvp.csv",
        ["ts", "name", "status"],
        rows,
      );
    });
  }

  const menuForm = $("menuForm");
  const menuStatus = $("menuStatus");
  const exportMenu = $("exportMenu");
  if (menuForm) {
    menuForm.addEventListener("submit", (e) => {
      e.preventDefault();
      const form = new FormData(menuForm);
      const name = String(form.get("name") || "").trim();
      const detail = String(form.get("detail") || "").trim();
      if (!name || !detail) return;

      const row = {
        ts: new Date().toISOString(),
        name,
        detail,
      };

      const rows = readJsonArray(MENU_KEY);
      rows.push(row);
      writeJsonArray(MENU_KEY, rows);
      if (menuStatus) menuStatus.textContent = "Enviando...";

      Promise.resolve()
        .then(() => postToSheets({ type: "menu", ...row }))
        .then((res) => {
          menuForm.reset();
          if (!menuStatus) return;
          if (res?.skipped) {
            menuStatus.textContent = "¡Gracias! Quedó registrado.";
            return;
          }
          if (res?.unverified) {
            menuStatus.textContent = "Enviado. Si no aparece en la planilla en unos segundos, reintentá.";
            return;
          }
          if (res?.ok) {
            menuStatus.textContent = "¡Gracias! Quedó registrado.";
            return;
          }
          menuStatus.textContent = "Guardado en el dispositivo, pero falló el envío a la planilla.";
        })
        .catch(() => {
          menuForm.reset();
          if (menuStatus) menuStatus.textContent = "Guardado en el dispositivo, pero falló el envío a la planilla.";
        });
    });
  }

  if (exportMenu) {
    exportMenu.addEventListener("click", () => {
      const rows = readJsonArray(MENU_KEY);
      downloadCsv(
        "menu-especial.csv",
        ["ts", "name", "detail"],
        rows,
      );
    });
  }

  // Countdown
  const embedWrap = $("countdownEmbedWrap");
  const embedFrame = $("countdownEmbed");
  const nativeWrap = $("countdown");

  const countdownEmbedUrl = cfg.event?.countdownEmbedUrl;
  if (countdownEmbedUrl && embedWrap && embedFrame) {
    embedFrame.src = countdownEmbedUrl;
    embedWrap.style.display = "block";
    if (nativeWrap) nativeWrap.style.display = "none";
    // If we embed, we don't need the native interval.
    return;
  }

  const targetIso = cfg.event?.start;
  const target = targetIso ? new Date(targetIso) : null;

  const tick = () => {
    if (!target || Number.isNaN(target.getTime())) return;

    const now = new Date();
    let diff = Math.max(0, target.getTime() - now.getTime());

    const sec = Math.floor(diff / 1000);
    const days = Math.floor(sec / 86400);
    const hours = Math.floor((sec % 86400) / 3600);
    const mins = Math.floor((sec % 3600) / 60);
    const secs = sec % 60;

    $("cdDays").textContent = String(days);
    $("cdHours").textContent = String(hours).padStart(2, "0");
    $("cdMins").textContent = String(mins).padStart(2, "0");
    $("cdSecs").textContent = String(secs).padStart(2, "0");
  };

  tick();
  setInterval(tick, 1000);

  // Audio
  const audio = $("bgAudio");
  const toggle = $("audioToggle");
  const label = $("audioLabel");

  let ready = false;
  let playing = false;

  const setLabel = () => {
    if (!label) return;
    label.textContent = playing ? "Pausar" : "Música";
  };

  const ensureAudio = () => {
    if (!audio || ready) return;
    const url = cfg.audio?.url;
    if (!url) return;
    audio.src = url;
    audio.loop = true;
    ready = true;
  };

  const play = async () => {
    ensureAudio();
    if (!audio || !ready) return;
    try {
      await audio.play();
      playing = true;
      setLabel();
    } catch {
      // Autoplay might be blocked; user gesture needed
    }
  };

  const pause = () => {
    if (!audio) return;
    audio.pause();
    playing = false;
    setLabel();
  };

  if (toggle) {
    toggle.addEventListener("click", () => {
      if (!cfg.audio?.url) return;
      playing ? pause() : play();
    });
  }

  if (cfg.audio?.autoplay) {
    const onFirstGesture = () => {
      window.removeEventListener("pointerdown", onFirstGesture);
      play();
    };
    window.addEventListener("pointerdown", onFirstGesture, { once: true });
  }

  setLabel();
})();
