// 10.0.2.2 is the host machine as seen from the Android emulator. On a real
// phone set EXPO_PUBLIC_API_URL to the laptop's LAN address.
export const API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://10.0.2.2:4000'
