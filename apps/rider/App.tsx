import { useEffect, useState } from 'react'
import { BackHandler } from 'react-native'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { StatusBar } from 'expo-status-bar'
import { GuidedCamera } from '@retake/capture'
import { createUploadQueue } from '@retake/native'
import { createApi } from './src/api'
import { API_URL } from './src/config'
import { RiderContext, useRider } from './src/context'
import { PickupScreen } from './src/screens/Pickup'
import { PickupsScreen } from './src/screens/Pickups'
import { createRiderStore } from './src/store'

const store = createRiderStore({ api: createApi(API_URL), queue: createUploadQueue() })

function Root() {
  const active = useRider((s) => s.active)
  const send = useRider((s) => s.send)
  const close = useRider((s) => s.close)
  const [camera, setCamera] = useState(false)

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (camera) setCamera(false)
      else if (active) close()
      else return false
      return true
    })
    return () => sub.remove()
  }, [camera, active, close])

  if (active && camera) {
    const photo = active.pickup.claimPhotos[0]
    return (
      <GuidedCamera
        title="Photo of the item"
        ghostUri={photo ? `${API_URL}/files/${photo}` : undefined}
        claimHashes={active.pickup.claimHashes}
        showTiming={__DEV__}
        onCancel={() => setCamera(false)}
        onCapture={(p) => {
          setCamera(false)
          send(p)
        }}
      />
    )
  }
  if (active) return <PickupScreen baseUrl={API_URL} onShoot={() => setCamera(true)} />
  return <PickupsScreen />
}

export default function App() {
  return (
    <RiderContext.Provider value={store}>
      <SafeAreaProvider>
        <StatusBar style="dark" />
        <Root />
      </SafeAreaProvider>
    </RiderContext.Provider>
  )
}
