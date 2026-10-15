import { useEffect, useState } from 'react'
import { BackHandler } from 'react-native'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { StatusBar } from 'expo-status-bar'
import { Provider } from 'react-redux'
import { GuidedCamera } from '@retake/capture'
import { createUploadQueue } from '@retake/native'
import { createApi } from './src/api'
import { API_URL } from './src/config'
import { useAppDispatch } from './src/hooks'
import { ClaimScreen } from './src/screens/Claim'
import { OrdersScreen } from './src/screens/Orders'
import { claim, makeStore } from './src/store'

const store = makeStore({ api: createApi(API_URL), queue: createUploadQueue() })

type Route = 'orders' | 'claim' | 'camera'

// Three screens with one back path each, so plain state instead of a router.
function Root() {
  const [route, setRoute] = useState<Route>('orders')
  const dispatch = useAppDispatch()

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (route === 'camera') setRoute('claim')
      else if (route === 'claim') {
        dispatch(claim.actions.closed())
        setRoute('orders')
      } else return false
      return true
    })
    return () => sub.remove()
  }, [route, dispatch])

  if (route === 'camera') {
    return (
      <GuidedCamera
        title="Photo of the item"
        onCancel={() => setRoute('claim')}
        onCapture={(p) => {
          dispatch(claim.actions.photoAdded(p))
          setRoute('claim')
        }}
      />
    )
  }
  if (route === 'claim') return <ClaimScreen onAddPhoto={() => setRoute('camera')} onDone={() => setRoute('orders')} />
  return <OrdersScreen onReport={() => setRoute('claim')} />
}

export default function App() {
  return (
    <Provider store={store}>
      <SafeAreaProvider>
        <StatusBar style="dark" />
        <Root />
      </SafeAreaProvider>
    </Provider>
  )
}
