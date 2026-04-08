class AudioPlayer {
  constructor() {
    this.audio = document.getElementById('bgAudio');
    this.toggle = document.getElementById('audioToggle');
    this.cover = document.getElementById('audioCover');
    this.title = document.getElementById('audioTitle');
    this.artist = document.getElementById('audioArtist');
    
    this.playing = false; // Asegurar que inicie en false
    this.ready = false;
    this.metadataLoaded = false;
    this.desiredVolume = 0.7;
    this.fadeDurationMs = 650;
    this._fadeRaf = null;
    this._hasCover = false;
    
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
    
    // Cargar metadatos automáticamente si está configurado
    if (window.INVITACION_CONFIG?.audio?.autoMetadata) {
      console.log('🎵 Auto-metadata activado');
      // Los metadatos se cargarán en loadedmetadata
    } else {
      console.log('🎵 Auto-metadata desactivado');
    }
  }
  
  setupEventListeners() {
    this.toggle.addEventListener('click', () => this.togglePlay());
  }
  
  setupAudioEvents() {
    this.audio.addEventListener('loadstart', () => {
      console.log('🎵 Cargando audio...');
      if (window.INVITACION_CONFIG?.audio?.autoMetadata) {
        this.updateMetadata('Cargando...', 'Por favor espera');
      }
      // Asegurar estado inicial correcto
      this.playing = false;
      this.updateButton();
    });
    
    this.audio.addEventListener('loadedmetadata', () => {
      console.log('🎵 Metadatos cargados');
      this.metadataLoaded = true;
      
      if (window.INVITACION_CONFIG?.audio?.autoMetadata) {
        this.extractMetadata();
        // Mostrar panel de metadatos si está activado
        const infoPanel = document.getElementById('audioInfo');
        if (infoPanel) {
          infoPanel.style.display = 'flex';
        }
      }
      // Asegurar estado inicial correcto
      this.playing = false;
      this.updateButton();
    });
    
    this.audio.addEventListener('canplaythrough', () => {
      this.ready = true;
      console.log('✅ Audio listo para reproducir');
      // Asegurar estado inicial correcto
      this.playing = false;
      this.updateButton();
    });

    this.audio.addEventListener('loadeddata', () => {
      this.ready = true;
      console.log('✅ Audio cargado (loadeddata)');
      this.playing = false;
      this.updateButton();
    });

    this.audio.addEventListener('canplay', () => {
      this.ready = true;
      console.log('✅ Audio listo para reproducir (canplay)');
      this.playing = false;
      this.updateButton();
    });
    
    this.audio.addEventListener('play', () => {
      this.playing = true;
      this.updateButton();
      this.animateCover();
    });
    
    this.audio.addEventListener('pause', () => {
      this.playing = false;
      this.updateButton();
      this.stopCoverAnimation();
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

      const prevVolume = this.audio.volume;
      try {
        this.audio.muted = true;
        this.audio.volume = 0;
        await this.audio.play();
        this.audio.pause();
        this.audio.currentTime = 0;
      } catch {
      } finally {
        this.audio.muted = false;
        this.audio.volume = prevVolume;
      }
    };

    document.addEventListener('pointerdown', unlock, { once: true, passive: true });
    document.addEventListener('touchstart', unlock, { once: true, passive: true });
  }
  
  async extractMetadata() {
    if (this.title.dataset.updated === 'true') return;
    
    try {
      const tags = await this.readId3TagsSafe(this.audio.src);

      if (tags?.title || tags?.artist) {
        this.updateMetadata(tags.title || 'Mi Canción', tags.artist || 'Artista');
        this.title.dataset.updated = 'true';
      } else {
        const fileName = this.getFileNameFromUrl(this.audio.src);
        const { title, artist } = this.parseFileName(fileName);
        this.updateMetadata(title, artist);
        this.title.dataset.updated = 'true';
      }

      if (tags?.pictureDataUrl) {
        this.updateCover(tags.pictureDataUrl);
        this._hasCover = true;
        return;
      }

      this.loadCoverArt();
      
    } catch (error) {
      console.log('🎵 No se pudieron extraer metadatos, usando defaults');
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
        resolve(null);
        return;
      }

      try {
        lib.read(url, {
          onSuccess: (result) => {
            try {
              const t = result?.tags || {};
              const title = t.title ? String(t.title) : '';
              const artist = t.artist ? String(t.artist) : '';

              let pictureDataUrl = null;
              const pic = t.picture;
              if (pic && pic.data && pic.format) {
                const bytes = new Uint8Array(pic.data);
                let binary = '';
                for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
                const base64 = btoa(binary);
                pictureDataUrl = `data:${pic.format};base64,${base64}`;
              }

              resolve({ title, artist, pictureDataUrl });
            } catch {
              resolve(null);
            }
          },
          onError: () => resolve(null),
        });
      } catch {
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
          coverUrl = `https://res.cloudinary.com/${cloudName}/image/upload/v1771953859/${tryPublicId}.${ext}`;
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
    
    console.log('🎵 Portada generada automáticamente para:', songName);
  }
  
  updateMetadata(title, artist) {
    if (this.title) this.title.textContent = title;
    if (this.artist) this.artist.textContent = artist;
  }
  
  updateCover(imageUrl) {
    if (!this.cover) return;

    this._hasCover = true;
    
    const img = document.createElement('img');
    img.src = imageUrl;
    img.alt = 'Portada del álbum';
    
    // Reemplazar placeholder con la imagen
    const placeholder = this.cover.querySelector('.audio-player__cover-placeholder');
    if (placeholder) {
      placeholder.style.display = 'none';
    }
    
    // Limpiar imágenes anteriores
    const existingImg = this.cover.querySelector('img');
    if (existingImg) {
      existingImg.remove();
    }
    
    this.cover.appendChild(img);
  }
  
  updateButton() {
    if (!this.toggle) return;
    
    const label = this.toggle.querySelector('#audioLabel');
    if (label) {
      label.textContent = this.playing ? '▶' : '♫';
    }
    
    // No cambiar el color del botón cuando está reproduciendo
  }
  
  animateCover() {
    if (!this.cover) return;
    this.cover.style.animation = 'pulse 2s infinite';
  }
  
  stopCoverAnimation() {
    if (!this.cover) return;
    this.cover.style.animation = 'none';
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
    if (!this.metadataLoaded) {
      console.log('🎵 Metadatos no cargados aún');
      return;
    }
    
    console.log('🎵 Cargando metadatos...');
    this.extractMetadata();
  }
}

// Agregar animación CSS para la portada
const style = document.createElement('style');
style.textContent = `
  @keyframes pulse {
    0% { transform: scale(1); }
    50% { transform: scale(1.05); }
    100% { transform: scale(1); }
  }
`;
document.head.appendChild(style);

// Inicializar el reproductor cuando el DOM esté listo
document.addEventListener('DOMContentLoaded', () => {
  window.__audioPlayer = new AudioPlayer();
});
