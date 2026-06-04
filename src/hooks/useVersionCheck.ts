import { useState, useEffect } from 'react'

export interface VersionInfo {
  currentVersion: string
  latestVersion: string
  hasUpdate: boolean
  releaseUrl: string
  releaseNotes: string
}

export function useVersionCheck() {
  const [versionInfo, setVersionInfo] = useState<VersionInfo | null>(null)
  const [isChecking, setIsChecking] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const checkForUpdates = async () => {
    setIsChecking(true)
    setError(null)

    try {
      // 从 package.json 获取当前版本（通过 vite 定义的环境变量）
      const currentVersion = '0.1.0'
      
      const response = await fetch('https://api.github.com/repos/yuanbw2025/storyforge/releases/latest', {
        headers: {
          'Accept': 'application/vnd.github.v3+json'
        }
      })

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }

      const release = await response.json()
      const latestVersion = release.tag_name.replace(/^v/, '')
      const hasUpdate = compareVersions(latestVersion, currentVersion) > 0

      setVersionInfo({
        currentVersion,
        latestVersion,
        hasUpdate,
        releaseUrl: release.html_url,
        releaseNotes: release.body || ''
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to check for updates')
    } finally {
      setIsChecking(false)
    }
  }

  useEffect(() => {
    checkForUpdates()
    
    // 每24小时检查一次更新
    const interval = setInterval(checkForUpdates, 24 * 60 * 60 * 1000)
    
    return () => clearInterval(interval)
  }, [])

  return {
    versionInfo,
    isChecking,
    error,
    checkForUpdates
  }
}

function compareVersions(v1: string, v2: string): number {
  const parts1 = v1.split('.').map(Number)
  const parts2 = v2.split('.').map(Number)
  const length = Math.max(parts1.length, parts2.length)

  for (let i = 0; i < length; i++) {
    const p1 = parts1[i] || 0
    const p2 = parts2[i] || 0
    if (p1 > p2) return 1
    if (p1 < p2) return -1
  }
  return 0
}