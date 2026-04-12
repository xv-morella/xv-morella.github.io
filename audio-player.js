class AudioPlayer {
  constructor() {
    this.audio = document.getElementById('bgAudio');
    this.toggle = document.getElementById('audioToggle');
    this.cover = document.getElementById('audioCover');
    this.discMedia = document.getElementById('audioDiscMedia');
    this.discMedia2 = document.getElementById('audioDiscMedia2');
    this.title = document.getElementById('audioTitle');
    this.artist = document.getElementById('audioArtist');
    this.playerEl = document.getElementById('audioPlayer');
    
    this.playing = false; // Asegurar que inicie en false
    this.ready = false;
    this.metadataLoaded = false;
    this.desiredVolume = 0.7;
    this.fadeDurationMs = 650;
    this._fadeRaf = null;
    this._hasCover = false;
    this.coverLoaded = false; // Nueva variable para controlar carga de portada
    
    this.init();
  }
  
  init() {
    if (!this.audio || !this.toggle) {
      console.error('❌ Elementos de audio no encontrados');
      return;
    }
    
    this.setupEventListeners();
    this.setupAudioEvents();
    this.loadAudio();
    this.setupIOSUnlock();
    this.setupAutoplay();
  }
  
  setupEventListeners() {
    this.toggle.addEventListener('click', () => this.togglePlay());
  }
  
  setupAudioEvents() {
    this.audio.addEventListener('loadstart', () => {
      console.log('🎵 Cargando audio...');
      this.updateMetadata('Cargando...', 'Por favor espera');
      // Asegurar estado inicial correcto
      this.playing = false;
      this.updateButton();
      this.updatePlayingUI();
    });
    
    this.audio.addEventListener('loadedmetadata', () => {
      console.log('🎵 Metadatos cargados');
      this.metadataLoaded = true;

      // Auto extraer metadatos si está habilitado en config
      const autoMetadata = window.INVITACION_CONFIG?.audio?.autoMetadata;
      if (autoMetadata) {
        console.log('🎵 Auto-extrayendo metadatos...');
        this.extractMetadata();
      }
      // Asegurar estado inicial correcto
      this.playing = false;
      this.updateButton();
      this.updatePlayingUI();
    });
    
    this.audio.addEventListener('canplaythrough', () => {
      this.ready = true;
      console.log('✅ Audio listo para reproducir');
      // Asegurar estado inicial correcto
      this.playing = false;
      this.updateButton();
      this.updatePlayingUI();
      // Verificar si podemos ocultar la pantalla de carga
      this.checkReadyToHideLoading();
    });

    this.audio.addEventListener('loadeddata', () => {
      this.ready = true;
      console.log('✅ Audio cargado (loadeddata)');
      this.playing = false;
      this.updateButton();
      this.updatePlayingUI();
      // Verificar si podemos ocultar la pantalla de carga
      this.checkReadyToHideLoading();
    });

    this.audio.addEventListener('canplay', () => {
      this.ready = true;
      console.log('✅ Audio listo para reproducir (canplay)');
      this.playing = false;
      this.updateButton();
      this.updatePlayingUI();
      // Verificar si podemos ocultar la pantalla de carga
      this.checkReadyToHideLoading();
    });
    
    this.audio.addEventListener('play', () => {
      this.playing = true;
      this.updateButton();
      this.updatePlayingUI();
    });
    
    this.audio.addEventListener('pause', () => {
      this.playing = false;
      this.updateButton();
      this.updatePlayingUI();
    });
    
    this.audio.addEventListener('error', (e) => {
      console.error('❌ Error de audio:', e);
      this.updateMetadata('Error', 'No se pudo cargar el audio');
    });
    
    this.audio.addEventListener('timeupdate', () => {
      if (this.metadataLoaded && !this.title.dataset.updated) {
        this.extractMetadata();
      }
    });
  }

  updatePlayingUI() {
    if (!this.playerEl) return;
    this.playerEl.classList.toggle('is-playing', !!this.playing);
  }
  
  loadAudio() {
    const url = window.INVITACION_CONFIG?.audio?.url;
    if (!url) {
      console.error('❌ No hay URL de audio configurada');
      this.updateMetadata('Sin audio', 'Configura una URL en config.js');
      return;
    }
    
    console.log('🎵 Cargando audio desde:', url);
    this.audio.src = url;
    this.audio.loop = true;
    this.audio.volume = this.desiredVolume;
    this.audio.crossOrigin = "anonymous";
    try {
      this.audio.load();
    } catch {
    }
  }

  setupIOSUnlock() {
    const unlock = async () => {
      if (!this.audio) return;
      if (this.audio.dataset.iosUnlocked === 'true') return;
      this.audio.dataset.iosUnlocked = 'true';

      console.log('🎵 Desbloqueando audio para iOS...');
      
      const prevVolume = this.audio.volume;
      try {
        // Crear audio silencioso para desbloquear contexto de audio
        const silentAudio = new Audio('data:audio/wav;base64,UklGRigAAABXQVZFZm10IBAAAAAAQAEAAEAfAAAQAQABAAgAZGF0YQAAAAA=');
        silentAudio.volume = 0;
        await silentAudio.play();
        
        // Desbloquear el audio principal
        this.audio.muted = true;
        this.audio.volume = 0;
        await this.audio.play();
        this.audio.pause();
        this.audio.currentTime = 0;
        
        console.log('🎵 Audio desbloqueado exitosamente');
      } catch (error) {
        console.log('🎵 Error al desbloquear audio:', error);
      } finally {
        this.audio.muted = false;
        this.audio.volume = prevVolume;
      }
    };

    // Múltiples eventos para asegurar desbloqueo
    const events = ['pointerdown', 'touchstart', 'touchend', 'mousedown', 'keydown'];
    events.forEach(event => {
      document.addEventListener(event, unlock, { once: true, passive: true });
    });
  }
  
  async extractMetadata() {
    if (this.title.dataset.updated === 'true') return;
    
    console.log('🎵 Extrayendo metadatos de:', this.audio.src);
    
    try {
      const tags = await this.readId3TagsSafe(this.audio.src);
      console.log('🎵 Tags encontrados:', tags);

      if (tags?.title || tags?.artist) {
        this.updateMetadata(tags.title || 'Mi Canción', tags.artist || 'Artista');
        this.title.dataset.updated = 'true';
        console.log('🎵 Metadatos actualizados:', tags.title, tags.artist);
      } else {
        const fileName = this.getFileNameFromUrl(this.audio.src);
        const { title, artist } = this.parseFileName(fileName);
        this.updateMetadata(title, artist);
        this.title.dataset.updated = 'true';
        console.log('🎵 Usando nombre de archivo:', title, artist);
      }

      if (tags?.pictureDataUrl) {
        this.updateCover(tags.pictureDataUrl);
        this._hasCover = true;
        console.log('🎵 Portada encontrada en metadatos');
        return;
      }

      console.log('🎵 Buscando portada externa...');
      this.loadCoverArt();
      
    } catch (error) {
      console.log('🎵 Error extrayendo metadatos:', error);
      const fileName = this.getFileNameFromUrl(this.audio.src);
      const { title, artist } = this.parseFileName(fileName);
      this.updateMetadata(title || 'Mi Canción', artist || 'Artista');
      this.loadCoverArt();
    }
  }

  readId3TagsSafe(url) {
    return new Promise((resolve) => {
      const lib = window.jsmediatags;
      if (!lib || typeof lib.read !== 'function') {
        console.log('🎵 jsmediatags no disponible');
        resolve(null);
        return;
      }

      console.log('🎵 Leyendo ID3 tags de:', url);

      try {
        const done = (result) => {
          try {
            console.log('🎵 ID3 tags leídos exitosamente');
            const t = result?.tags || {};
            const title = t.title ? String(t.title) : '';
            const artist = t.artist ? String(t.artist) : '';

            let pictureDataUrl = null;
            const pic = t.picture;
            if (pic && pic.data && pic.format) {
              console.log('🎵 Portada encontrada en ID3 tags');
              const bytes = new Uint8Array(pic.data);
              let binary = '';
              for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
              const base64 = btoa(binary);
              pictureDataUrl = `data:${pic.format};base64,${base64}`;
            }

            resolve({ title, artist, pictureDataUrl });
          } catch (error) {
            console.log('🎵 Error procesando ID3 tags:', error);
            resolve(null);
          }
        };

        const fail = (error) => {
          console.log('🎵 Error leyendo ID3 tags:', error);
          resolve(null);
        };

        // Para Cloudinary, intentar primero con fetch para evitar CORS
        if (url.includes('cloudinary.com')) {
          fetch(url, { mode: 'cors', cache: 'no-store' })
            .then((r) => {
              if (!r.ok) throw new Error('fetch_failed');
              console.log('🎵 Fetch exitoso, leyendo tags...');
              return r.arrayBuffer();
            })
            .then((buf) => {
              const blob = new Blob([buf], { type: 'audio/mpeg' });
              lib.read(blob, { onSuccess: done, onError: fail });
            })
            .catch((error) => {
              console.log('🎵 Fetch falló, intentando directamente:', error);
              lib.read(url, { onSuccess: done, onError: fail });
            });
        } else {
          // Para otras URLs, leer directamente
          lib.read(url, { onSuccess: done, onError: fail });
        }
      } catch (error) {
        console.log('🎵 Error en readId3TagsSafe:', error);
        resolve(null);
      }
    });
  }
  
  getFileNameFromUrl(url) {
    return url.split('/').pop().split('?')[0];
  }
  
  parseFileName(fileName) {
    // Para Cloudinary, el nombre está en la URL antes de la extensión
    // Ej: music_aawuln.mp3 -> Music
    const nameWithoutExt = fileName.replace(/\.(mp3|wav|m4a|ogg)$/i, '');
    
    // Limpiar caracteres especiales y números aleatorios de Cloudinary
    let cleanName = nameWithoutExt.replace(/_[a-zA-Z0-9]+$/, ''); // Remover sufijo _random
    cleanName = cleanName.replace(/[-_]/g, ' '); // Reemplazar guiones y guiones bajos
    
    // Capitalizar palabras
    const words = cleanName.split(' ').map(word => 
      word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
    ).filter(word => word.length > 0);
    
    if (words.length === 0) {
      return {
        title: 'Mi Canción',
        artist: 'Artista'
      };
    }
    
    // Si solo hay una palabra, usarla como título
    if (words.length === 1) {
      return {
        title: words[0],
        artist: 'Artista'
      };
    }
    
    // Intentar separar artista y título si hay múltiples palabras
    // Para el caso de "music_aawuln", interpretamos como "Music"
    return {
      title: words.join(' '),
      artist: 'Morella XV' // Usar el nombre de la fiesta como artista
    };
  }
  
  async loadCoverArt() {
    if (this._hasCover) return;
    // Para Cloudinary, intentar diferentes patrones de portada
    const audioUrl = this.audio.src;
    const fileName = this.getFileNameFromUrl(audioUrl);
    const baseName = fileName.replace(/\.(mp3|wav|m4a|ogg)$/i, '');
    
    // Patrones de portada para intentar con Cloudinary
    const coverPatterns = [
      // Mismo nombre que el audio pero con extensión de imagen
      `${baseName}.jpg`,
      `${baseName}.jpeg`,
      `${baseName}.png`,
      `${baseName}.webp`,
      // Patrones comunes
      `${baseName}_cover.jpg`,
      `${baseName}_art.jpg`,
      `${baseName}_album.jpg`,
      // Usar el ID de Cloudinary si existe
      `music_aawuln_gkdpjh.jpg`,
      `music_aawuln_gkdpjh.png`,
      `music_aawuln.jpg`,
      `music_aawuln.png`
    ];
    
    const baseUrl = audioUrl.substring(0, audioUrl.lastIndexOf('/'));
    const cloudNameMatch = audioUrl.match(/https:\/\/res\.cloudinary\.com\/([^/]+)\//);
    const cloudName = cloudNameMatch ? cloudNameMatch[1] : null;
    const cloudFolderMatch = audioUrl.match(/\/upload\/v\d+\/(.+)\.(mp3|wav|m4a|ogg)/i);
    const publicId = cloudFolderMatch ? cloudFolderMatch[1] : null;
    
    for (const pattern of coverPatterns) {
      try {
        let coverUrl = `${baseUrl}/${pattern}`;

        // En Cloudinary, las imágenes suelen estar bajo image/upload
        if (cloudName && publicId) {
          const tryPublicId = publicId.replace(/\.(mp3|wav|m4a|ogg)$/i, '');
          const ext = pattern.split('.').pop();
          // Usar la misma versión que el audio actual (v1776023124)
          coverUrl = `https://res.cloudinary.com/${cloudName}/image/upload/v1776023124/${tryPublicId}.${ext}`;
        }
        const img = new Image();
        img.crossOrigin = 'anonymous';
        
        const loadPromise = new Promise((resolve, reject) => {
          img.onload = () => {
            this.updateCover(img.src);
            console.log('🎵 Portada encontrada:', coverUrl);
            resolve();
          };
          img.onerror = reject;
        });
        
        img.src = coverUrl;
        
        // Esperar un corto tiempo para ver si carga
        await Promise.race([loadPromise, new Promise(resolve => setTimeout(resolve, 2000))]);
        
        if (img.complete && img.naturalHeight !== 0) {
          return; // Portada encontrada y cargada
        }
      } catch (error) {
        continue; // Intentar siguiente patrón
      }
    }
    
    // Si no se encuentra portada, usar una generada con el nombre
    this.generateDefaultCover(baseName);
  }
  
  generateDefaultCover(songName) {
    // Crear una portada por defecto con el nombre de la canción
    const canvas = document.createElement('canvas');
    canvas.width = 300;
    canvas.height = 300;
    const ctx = canvas.getContext('2d');
    
    // Gradiente de fondo
    const gradient = ctx.createLinearGradient(0, 0, 300, 300);
    gradient.addColorStop(0, '#667eea');
    gradient.addColorStop(1, '#764ba2');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 300, 300);
    
    // Icono de música
    ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
    ctx.font = 'bold 80px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('♪', 150, 120);
    
    // Nombre de la canción
    ctx.fillStyle = 'white';
    ctx.font = 'bold 24px Arial';
    ctx.fillText(songName.replace(/_[a-zA-Z0-9]+$/, '').toUpperCase(), 150, 200);
    
    // Convertir a URL
    const dataUrl = canvas.toDataURL('image/png');
    this.updateCover(dataUrl);
    
    // Marcar como cargada inmediatamente ya que es generada localmente
    this.coverLoaded = true;
    this.checkReadyToHideLoading();
    
    console.log('🎵 Portada generada automáticamente para:', songName);
  }
  
  updateMetadata(title, artist) {
    if (this.title) this.title.textContent = title;
    if (this.artist) this.artist.textContent = artist;
  }
  
  updateCover(imageUrl) {
    if (!this.discMedia) return;

    this._hasCover = true;
    const safeUrl = encodeURI(String(imageUrl || '')).replace(/'/g, '%27');

    // Crear imagen para verificar carga
    const img = new Image();
    img.onload = () => {
      console.log('🎵 Portada cargada completamente');
      this.coverLoaded = true;
      this.checkReadyToHideLoading();
    };
    img.onerror = () => {
      console.log('🎵 Error cargando portada, continuando igual');
      this.coverLoaded = true; // Marcar como cargada aunque haya error para no bloquear
      this.checkReadyToHideLoading();
    };
    img.src = safeUrl;

    if (this.discMedia2) {
      this.discMedia2.style.backgroundImage = `url('${safeUrl}')`;
      this.discMedia2.style.backgroundSize = 'cover';
      this.discMedia2.style.backgroundPosition = 'center';
    }

    this.discMedia.style.backgroundImage =
      `radial-gradient(circle at center, rgba(0,0,0,0) 0 18%, rgba(0,0,0,0.62) 18% 20%, rgba(0,0,0,0) 20% 100%), url('${safeUrl}')`;
    this.discMedia.style.backgroundSize = 'cover';
    this.discMedia.style.backgroundPosition = 'center';
  }
  
  updateButton() {
    if (!this.toggle) return;
    
    const label = this.toggle.querySelector('#audioLabel');
    if (label) {
      label.textContent = this.playing ? '❚❚' : '▶';
    }
    
    // No cambiar el color del botón cuando está reproduciendo
  }

  fadeVolume(targetVolume, durationMs) {
    if (!this.audio) return Promise.resolve();
    if (this._fadeRaf) cancelAnimationFrame(this._fadeRaf);

    const startVolume = this.audio.volume;
    const delta = targetVolume - startVolume;
    const start = performance.now();

    return new Promise((resolve) => {
      const step = (now) => {
        const t = Math.min(1, (now - start) / Math.max(1, durationMs));
        this.audio.volume = startVolume + delta * t;
        if (t < 1) {
          this._fadeRaf = requestAnimationFrame(step);
        } else {
          this._fadeRaf = null;
          resolve();
        }
      };
      this._fadeRaf = requestAnimationFrame(step);
    });
  }
  
  async togglePlay() {
    if (!this.ready) {
      try {
        this.audio.load();
      } catch {
      }
    }
    
    if (this.playing) {
      await this.fadeVolume(0, this.fadeDurationMs);
      this.audio.pause();
      this.audio.volume = this.desiredVolume;
    } else {
      try {
        this.audio.volume = 0;
        await this.audio.play();
        await this.fadeVolume(this.desiredVolume, this.fadeDurationMs);
      } catch (error) {
        console.error('❌ Error al reproducir:', error);
        if (error.name === 'NotAllowedError') {
          console.log('🔒 Autoplay bloqueado - esperando interacción del usuario');
        }
      }
    }
  }

  loadMetadata() {
    this.extractMetadata();
  }

  setupAutoplay() {
    const autoplay = window.INVITACION_CONFIG?.audio?.autoplay;
    if (!autoplay) {
      console.log('🎵 Autoplay deshabilitado');
      this.hideLoadingScreen();
      return;
    }

    console.log('🎵 Configurando autoplay simple...');
    this.autoplayHandled = false;
    
    // Función única de autoplay
    const handleAutoplay = async () => {
      if (this.autoplayHandled || this.playing) {
        console.log('🎵 Autoplay ya manejado o reproduciendo');
        return;
      }
      
      this.autoplayHandled = true;
      console.log('🎵 Iniciando reproducción única...');
      
      try {
        // Configurar audio
        this.audio.loop = true;
        this.audio.volume = 0;
        
        // Intentar reproducir
        await this.audio.play();
        
        // Si funciona, hacer fade-in
        await this.fadeVolume(this.desiredVolume, 1000);
        this.playing = true;
        this.updateButton();
        this.updatePlayingUI();
        
        console.log('✅ Reproducción exitosa');
        
      } catch (error) {
        console.log('❌ Autoplay bloqueado, esperando interacción');
        this.setupSingleInteraction();
      }
      
      // No ocultar pantalla de carga aquí, esperar a que todo esté listo
    };

    // Solo un evento de carga
    this.audio.addEventListener('canplaythrough', handleAutoplay, { once: true });
    
    // Timeout de seguridad
    setTimeout(() => {
      if (!this.autoplayHandled && !this.playing) {
        handleAutoplay();
      }
    }, 3000);
  }

  setupSingleInteraction() {
    console.log('🎵 Configurando interacción única...');
    
    const playOnce = async (e) => {
      if (this.playing) return;
      
      e.preventDefault();
      e.stopPropagation();
      
      try {
        this.audio.loop = true;
        this.audio.volume = 0;
        await this.audio.play();
        await this.fadeVolume(this.desiredVolume, 800);
        this.playing = true;
        this.updateButton();
        this.updatePlayingUI();
        
        console.log('✅ Audio iniciado por interacción');
        
      } catch (error) {
        console.log('❌ Error en interacción:', error);
      }
    };

    // Solo un listener global
    document.addEventListener('click', playOnce, { once: true, passive: false });
    document.addEventListener('touchstart', playOnce, { once: true, passive: false });
  }

  
  
  checkReadyToHideLoading() {
    // Solo ocultar si el audio está listo Y la portada está cargada
    if (this.ready && this.coverLoaded) {
      console.log('🎵 Audio y portada listos, ocultando pantalla de carga');
      setTimeout(() => {
        this.hideLoadingScreen();
      }, 300); // Pequeño delay para asegurar que todo esté renderizado
    }
  }

  hideLoadingScreen() {
    const loadingScreen = document.getElementById('loadingScreen');
    if (loadingScreen) {
      loadingScreen.classList.add('hidden');
      console.log('🎵 Pantalla de carga oculta');
    }
  }
}

// Inicializar el reproductor cuando el DOM esté listo
document.addEventListener('DOMContentLoaded', () => {
  window.__audioPlayer = new AudioPlayer();
});
