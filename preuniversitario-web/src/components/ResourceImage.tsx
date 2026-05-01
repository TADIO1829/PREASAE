import { useEffect, useState } from 'react'
import { supabase } from '../services/supabaseClient'
import { isSafeHttpUrl } from '../utils/security'

interface ResourceImageProps {
  resource?: string | null
  alt: string
  className?: string
}

export default function ResourceImage({ resource, alt, className }: ResourceImageProps) {
  const [src, setSrc] = useState<string | null>(null)

  useEffect(() => {
    if (!resource) {
      setSrc(null)
      return
    }

    if (isSafeHttpUrl(resource)) {
      setSrc(resource)
      return
    }

    let isActive = true
    let objectUrl: string | null = null

    void (async () => {
      const { data, error } = await supabase.storage.from('archivos').download(resource)
      if (error || !data || !isActive) {
        return
      }

      objectUrl = URL.createObjectURL(data)
      setSrc(objectUrl)
    })()

    return () => {
      isActive = false
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl)
      }
    }
  }, [resource])

  if (!src) return null

  return <img src={src} alt={alt} className={className} />
}
