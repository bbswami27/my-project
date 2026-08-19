// GitPit - Location Sharing Service

class LocationService {
  constructor() {
    this.landmarks = [
      { name: 'India Gate, New Delhi', lat: 28.6129, lng: 77.2295, address: 'Rajpath, India Gate, New Delhi, Delhi 110001' },
      { name: 'Marine Drive, Mumbai', lat: 18.9432, lng: 72.8230, address: 'Netaji Subhash Chandra Bose Road, Mumbai, MH' },
      { name: 'MG Road, Bengaluru', lat: 12.9756, lng: 77.6066, address: 'Mahatma Gandhi Road, Bengaluru, Karnataka' },
      { name: 'Cyber City, Gurugram', lat: 28.4950, lng: 77.0895, address: 'DLF Phase 2, Gurugram, Haryana 122002' },
      { name: 'Hitech City, Hyderabad', lat: 17.4435, lng: 78.3772, address: 'HITEC City, Madhapur, Hyderabad, Telangana' }
    ];
  }

  async shareCurrentLocation() {
    const activeChat = window.ChatEngine ? window.ChatEngine.getActiveChat() : null;
    if (!activeChat) {
      alert('Please open a chat to share your location!');
      return;
    }

    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const lat = pos.coords.latitude;
          const lng = pos.coords.longitude;
          this.sendLocationMessage(activeChat.id, {
            title: 'Live Location 📍',
            address: `Lat: ${lat.toFixed(4)}, Lng: ${lng.toFixed(4)}`,
            lat: lat,
            lng: lng,
            mapUrl: `https://www.google.com/maps?q=${lat},${lng}`
          });
        },
        (err) => {
          console.warn('Geolocation denied or timed out, using landmark simulation:', err);
          this.shareLandmarkLocation(activeChat.id);
        },
        { timeout: 5000 }
      );
    } else {
      this.shareLandmarkLocation(activeChat.id);
    }
  }

  shareLandmarkLocation(chatId) {
    const randomLandmark = this.landmarks[Math.floor(Math.random() * this.landmarks.length)];
    this.sendLocationMessage(chatId, {
      title: randomLandmark.name,
      address: randomLandmark.address,
      lat: randomLandmark.lat,
      lng: randomLandmark.lng,
      mapUrl: `https://www.google.com/maps?q=${randomLandmark.lat},${randomLandmark.lng}`
    });
  }

  sendLocationMessage(chatId, locData) {
    if (window.ChatEngine) {
      window.ChatEngine.sendMessage({
        type: 'location',
        locationTitle: locData.title,
        locationAddress: locData.address,
        mapUrl: locData.mapUrl,
        lat: locData.lat,
        lng: locData.lng,
        text: `📍 Shared Location: ${locData.title}`
      });
    }
  }
}

window.LocationService = new LocationService();
