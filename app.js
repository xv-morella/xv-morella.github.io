(function () {
  console.log('App.js script loaded');
  
  const cfg = window.INVITACION_CONFIG;
  if (!cfg) {
    console.error('INVITACION_CONFIG not found');
    return;
  }
  
  console.log('Config loaded:', cfg);

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

      const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
      const isAndroid = /Android/.test(navigator.userAgent);

      if (isIOS) {
        // Build .ics for iOS Calendar (webcal) using UTC to avoid timezone shifts
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
          `DTSTART;VALUE=DATE-TIME:${toIcsUtc(start)}\r\n` +
          `DTEND;VALUE=DATE-TIME:${toIcsUtc(end)}\r\n` +
          `SUMMARY:${String(title).replace(/\n/g, " ")}\r\n` +
          `DESCRIPTION:${String(description).replace(/\n/g, "\\n")}\r\n` +
          `LOCATION:${String(location).replace(/\n/g, " ")}\r\n` +
          `X-GOOGLE-ALLOW-INVITE-NO:TRUE\r\n` +
          `X-GOOGLE-ALLOW-SEE-GUESTS:NO\r\n` +
          `BEGIN:VALARM\r\n` +
          `ACTION:DISPLAY\r\n` +
          `DESCRIPTION:Event reminder\r\n` +
          `TRIGGER:-P1D\r\n` +
          `END:VALARM\r\n` +
          "END:VEVENT\r\n" +
          "END:VCALENDAR\r\n";
        const icsBlob = new Blob([ics], { type: "text/calendar;charset=utf-8" });
        const icsUrl = URL.createObjectURL(icsBlob);
        // Open via webcal protocol to add to iOS Calendar
        const webcalUrl = icsUrl.replace(/^http:/, "webcal:").replace(/^https:/, "webcal:");
        window.location.href = webcalUrl;
        // Clean up
        setTimeout(() => URL.revokeObjectURL(icsUrl), 5000);
      } else if (isAndroid) {
        // Google Calendar for Android: use local time to avoid timezone shift
        const formatDate = (d) => d.getFullYear() + String(d.getMonth() + 1).padStart(2, "0") + String(d.getDate()).padStart(2, "0") + "T" + String(d.getHours()).padStart(2, "0") + String(d.getMinutes()).padStart(2, "0") + String(d.getSeconds()).padStart(2, "0");
        const gcalUrl = new URL("https://calendar.google.com/calendar/render");
        gcalUrl.searchParams.set("action", "TEMPLATE");
        gcalUrl.searchParams.set("text", title);
        gcalUrl.searchParams.set("dates", `${formatDate(start)}/${formatDate(end)}`);
        if (description) gcalUrl.searchParams.set("details", description);
        if (location) gcalUrl.searchParams.set("location", location);
        gcalUrl.searchParams.set("trp", "false");
        gcalUrl.searchParams.set("rem", "1440");
        window.open(gcalUrl.toString(), "_blank", "noopener,noreferrer");
      } else {
        // Desktop: Google Calendar with local time
        const formatDate = (d) => d.getFullYear() + String(d.getMonth() + 1).padStart(2, "0") + String(d.getDate()).padStart(2, "0") + "T" + String(d.getHours()).padStart(2, "0") + String(d.getMinutes()).padStart(2, "0") + String(d.getSeconds()).padStart(2, "0");
        const gcalUrl = new URL("https://calendar.google.com/calendar/render");
        gcalUrl.searchParams.set("action", "TEMPLATE");
        gcalUrl.searchParams.set("text", title);
        gcalUrl.searchParams.set("dates", `${formatDate(start)}/${formatDate(end)}`);
        if (description) gcalUrl.searchParams.set("details", description);
        if (location) gcalUrl.searchParams.set("location", location);
        gcalUrl.searchParams.set("trp", "false");
        gcalUrl.searchParams.set("rem", "1440");
        window.open(gcalUrl.toString(), "_blank", "noopener,noreferrer");
      }
    });
  }

  if (cfg.venue?.title) $("whereTitle").textContent = cfg.venue.title;
  if (cfg.venue?.name) $("venueName").textContent = cfg.venue.name;
  if (cfg.venue?.address) $("venueAddress").textContent = cfg.venue.address;

  if (cfg.venue?.mapsUrl) {
    $("mapsLink").href = cfg.venue.mapsUrl;
    if (cfg.venue?.mapsLinkLabel) {
      $("mapsLink").textContent = cfg.venue.mapsLinkLabel;
    }
  } else {
    $("mapsLink").style.display = "none";
  }

  const embed = $("mapsEmbed");
  const mapsEmbedUrl = cfg.venue?.mapsEmbedUrl || "";
  const mapsUrl = cfg.venue?.mapsUrl || "";
  if (embed) {
    if (mapsEmbedUrl) {
      embed.src = mapsEmbedUrl;
    } else if (mapsUrl) {
      // Build a simple embed URL from Google Maps URL (mapsUrl)
      const placeIdMatch = mapsUrl.match(/!1s([^!]+)/);
      const coordsMatch = mapsUrl.match(/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/);
      if (placeIdMatch && coordsMatch) {
        const placeId = placeIdMatch[1];
        const lat = coordsMatch[1];
        const lng = coordsMatch[2];
        embed.src = `https://www.google.com/maps/embed/v1/place?key=&q=place_id:${placeId}&center=${lat},${lng}&zoom=16&maptype=roadmap`;
      } else {
        embed.closest(".panel--map").style.display = "none";
      }
    } else {
      embed.closest(".panel--map").style.display = "none";
    }
  }

  if (cfg.rsvp?.title) $("rsvpTitle").textContent = cfg.rsvp.title;
  if (cfg.rsvp?.text) $("rsvpText").textContent = cfg.rsvp.text;

  if (cfg.menu?.title) $("menuTitle").textContent = cfg.menu.title;
  if (cfg.menu?.text) $("menuText").textContent = cfg.menu.text;

  if (cfg.dresscode?.title) $("dressTitle").textContent = cfg.dresscode.title;
  if (cfg.dresscode?.value) $("dressValue").textContent = cfg.dresscode.value;

  if (cfg.playlist?.title) $("playlistTitle").textContent = cfg.playlist.title;
  if (cfg.playlist?.text) $("playlistText").textContent = cfg.playlist.text;

  if (cfg.playlist?.spotifyUrl) {
    const playlistBtn = $("playlistSuggest");
    if (playlistBtn) {
      playlistBtn.addEventListener("click", () => {
        window.open(cfg.playlist.spotifyUrl, "_blank", "noopener,noreferrer");
      });
    }
  }

  // Gift section
  if (cfg.gift?.title) $("giftTitle").textContent = cfg.gift.title;
  if (cfg.gift?.text) $("giftText").textContent = cfg.gift.text;
  if (cfg.gift?.alias) $("giftAlias").textContent = cfg.gift.alias;

  const giftAlias = $("giftAlias");
  if (giftAlias) {
    giftAlias.addEventListener("click", () => {
      navigator.clipboard.writeText(cfg.gift?.alias || "").then(() => {
        const original = giftAlias.textContent;
        giftAlias.textContent = "¡Copiado!";
        setTimeout(() => {
          giftAlias.textContent = original;
        }, 1500);
      });
    });
  }

  const RSVP_KEY = "invitacion_rsvp";
  const MENU_KEY = "invitacion_menu";

  const rsvpConfirm = $("rsvpConfirm");
  const rsvpStatus = $("rsvpStatus");
  if (rsvpConfirm) {
    rsvpConfirm.addEventListener("click", () => {
      const formUrl = cfg.rsvp?.formUrl;
      if (!formUrl) {
        if (rsvpStatus) rsvpStatus.textContent = "Falta configurar el link del formulario.";
        return;
      }
      window.open(formUrl, "_blank", "noopener,noreferrer");
    });
  }

  const menuConfirm = $("menuConfirm");
  const menuStatus = $("menuStatus");
  if (menuConfirm) {
    menuConfirm.addEventListener("click", () => {
      const formUrl = cfg.menu?.formUrl;
      if (!formUrl) {
        if (menuStatus) menuStatus.textContent = "Falta configurar el link del formulario.";
        return;
      }
      window.open(formUrl, "_blank", "noopener,noreferrer");
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
  }

  const shouldRunNativeCountdown = !(countdownEmbedUrl && embedWrap && embedFrame);

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

    const elDays = $("cdDays");
    const elHours = $("cdHours");
    const elMins = $("cdMins");
    const elSecs = $("cdSecs");
    if (elDays) elDays.textContent = String(days);
    if (elHours) elHours.textContent = String(hours).padStart(2, "0");
    if (elMins) elMins.textContent = String(mins).padStart(2, "0");
    if (elSecs) elSecs.textContent = String(secs).padStart(2, "0");
  };

  if (shouldRunNativeCountdown) {
    tick();
    setInterval(tick, 1000);
  }

  const initStars = async () => {
    const containers = Array.from(
      document.querySelectorAll(".hero__stars, .section__stars, .footer__stars")
    );
    if (!containers.length) return;

    let svgText = "";
    try {
      const res = await fetch("star.svg", { cache: "no-store" });
      svgText = await res.text();
    } catch {
      return;
    }

    const parser = new DOMParser();
    const doc = parser.parseFromString(svgText, "image/svg+xml");
    const template = doc.querySelector("svg");
    if (!template) return;

    const createStarSvg = ({ seed, durScale, beginOffset, idSuffix }) => {
      const svg = template.cloneNode(true);
      svg.removeAttribute("width");
      svg.removeAttribute("height");

      const ids = [
        "pearlGradient",
        "pearlSurface",
        "pearlTexture",
        "iridescentEffect",
        "shimmer",
      ];

      for (const baseId of ids) {
        const el = svg.querySelector(`#${baseId}`);
        if (el) el.id = `${baseId}-${idSuffix}`;
      }

      const refs = svg.querySelectorAll("[fill],[stroke],[filter]");
      for (const el of refs) {
        const fill = el.getAttribute("fill");
        const stroke = el.getAttribute("stroke");
        const filter = el.getAttribute("filter");

        if (fill && fill.startsWith("url(#")) {
          const id = fill.slice(5, -1);
          if (ids.includes(id)) el.setAttribute("fill", `url(#${id}-${idSuffix})`);
        }
        if (stroke && stroke.startsWith("url(#")) {
          const id = stroke.slice(5, -1);
          if (ids.includes(id)) el.setAttribute("stroke", `url(#${id}-${idSuffix})`);
        }
        if (filter && filter.startsWith("url(#")) {
          const id = filter.slice(5, -1);
          if (ids.includes(id)) el.setAttribute("filter", `url(#${id}-${idSuffix})`);
        }
      }

      const turb = svg.querySelector("feTurbulence");
      if (turb) turb.setAttribute("seed", String(seed));

      const anims = svg.querySelectorAll("animate");
      for (const a of anims) {
        const dur = a.getAttribute("dur");
        if (dur && dur.endsWith("s")) {
          const n = Number(dur.slice(0, -1));
          if (!Number.isNaN(n)) a.setAttribute("dur", `${Math.max(0.35, n * durScale)}s`);
        }
        a.setAttribute("begin", `${Math.max(0, beginOffset)}s`);
      }

      return svg;
    };

    const rand = (min, max) => min + Math.random() * (max - min);
    const randInt = (min, max) => Math.floor(rand(min, max + 1));

    for (const c of containers) {
      c.classList.add("stars--js");
      c.textContent = "";

      const rect = c.getBoundingClientRect();
      const w = Math.max(1, rect.width);
      const h = Math.max(1, rect.height);
      const padding = Math.max(5, Math.min(12, Math.min(w, h) * 0.02));
      const placed = [];

      const isHero = c.classList.contains("hero__stars");
      const isFooter = c.classList.contains("footer__stars");
      const count = isHero ? 26 : isFooter ? 20 : 20;

      for (let i = 0; i < count; i++) {
        const star = document.createElement("div");
        star.className = "star";

        const size = randInt(18, 48);
        const r = size / 2;

        const fits = (x, y) => {
          for (const p of placed) {
            const dx = x - p.x;
            const dy = y - p.y;
            const min = (p.size / 2) + r + padding;
            if (dx * dx + dy * dy < min * min) return false;
          }
          return true;
        };

        let x = 0;
        let y = 0;
        let ok = false;
        const maxTries = 90;
        for (let t = 0; t < maxTries; t++) {
          // Keep within bounds so the star doesn't clip
          x = rand(r + 2, w - r - 2);
          y = rand(r + 2, h - r - 2);
          if (fits(x, y)) {
            ok = true;
            break;
          }
        }

        if (!ok) {
          // Fallback: accept last position to avoid infinite loops on small screens
          x = rand(r + 2, w - r - 2);
          y = rand(r + 2, h - r - 2);
        }

        placed.push({ x, y, size });

        star.style.width = `${size}px`;
        star.style.height = `${size}px`;
        star.style.left = `${(x / w) * 100}%`;
        star.style.top = `${(y / h) * 100}%`;
        star.style.opacity = "0.40";
        star.style.mixBlendMode = "screen";
        star.style.filter = "drop-shadow(0 0 6px rgba(255,255,255,0.45))";

        const svg = createStarSvg({
          seed: randInt(1, 9999),
          durScale: rand(0.7, 1.35),
          beginOffset: rand(0, 2.5),
          idSuffix: `${Date.now()}-${Math.random().toString(16).slice(2)}-${i}`,
        });

        star.appendChild(svg);
        c.appendChild(star);
      }
    }
  };

  initStars();

  // Audio functionality moved to audio-player.js
  console.log('🎵 Audio functionality handled by audio-player.js');

  console.log('App.js initialization complete');
})();
