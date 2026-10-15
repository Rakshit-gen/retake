import { Directory, File, Paths } from 'expo-file-system'
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator'

/**
 * Shrinks a camera photo to upload size and moves it into the app's documents
 * folder. Not the cache folder: Android may clear that while the upload queue
 * is still waiting for a network.
 */
export async function savePhoto(cameraPath: string, maxSide = 1600): Promise<string> {
  const source = cameraPath.startsWith('file://') ? cameraPath : `file://${cameraPath}`
  const ref = await ImageManipulator.manipulate(source).resize({ width: maxSide }).renderAsync()
  const out = await ref.saveAsync({ compress: 0.8, format: SaveFormat.JPEG })
  ref.release()
  const dir = new Directory(Paths.document, 'photos')
  dir.create({ idempotent: true, intermediates: true })
  const dest = new File(dir, `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`)
  new File(out.uri).moveSync(dest)
  new File(source).delete()
  return dest.uri
}
