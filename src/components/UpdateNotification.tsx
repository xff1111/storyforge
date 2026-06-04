import { useState } from 'react'
import { RefreshCw, X, AlertCircle } from 'lucide-react'
import { VersionInfo } from '../hooks/useVersionCheck'

interface UpdateNotificationProps {
  versionInfo: VersionInfo
  onRefresh: () => void
}

export function UpdateNotification({ versionInfo, onRefresh }: UpdateNotificationProps) {
  const [isExpanded, setIsExpanded] = useState(false)

  if (!versionInfo.hasUpdate) return null

  return (
    <div className="fixed bottom-4 right-4 z-50 max-w-md">
      <div className="bg-gradient-to-r from-amber-500 to-orange-500 rounded-xl shadow-2xl overflow-hidden animate-slide-up">
        <div className="p-4">
          <div className="flex items-start gap-3">
            <div className="flex-shrink-0 w-10 h-10 bg-white/20 rounded-full flex items-center justify-center">
              <AlertCircle className="w-5 h-5 text-white" />
            </div>
            
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-white">新版本可用</h3>
                <button
                  onClick={() => setIsExpanded(!isExpanded)}
                  className="text-white/80 hover:text-white transition-colors p-1"
                >
                  {isExpanded ? <X className="w-4 h-4" /> : <RefreshCw className="w-4 h-4" />}
                </button>
              </div>
              
              <p className="text-white/90 text-sm mt-1">
                当前版本 <span className="font-mono">{versionInfo.currentVersion}</span>
                {' → '}
                最新版本 <span className="font-mono font-bold">{versionInfo.latestVersion}</span>
              </p>

              {isExpanded && (
                <div className="mt-3 pt-3 border-t border-white/20">
                  <p className="text-white/80 text-xs mb-3 line-clamp-4">
                    {versionInfo.releaseNotes || '暂无更新说明'}
                  </p>
                  <div className="flex gap-2">
                    <a
                      href={versionInfo.releaseUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-4 py-2 bg-white text-amber-600 rounded-lg text-sm font-medium hover:bg-white/90 transition-colors"
                    >
                      查看详情
                    </a>
                    <button
                      onClick={onRefresh}
                      className="px-4 py-2 bg-white/20 text-white rounded-lg text-sm font-medium hover:bg-white/30 transition-colors"
                    >
                      稍后提醒
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes slide-up {
          from {
            opacity: 0;
            transform: translateY(20px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        .animate-slide-up {
          animation: slide-up 0.3s ease-out;
        }
        .line-clamp-4 {
          display: -webkit-box;
          -webkit-line-clamp: 4;
          -webkit-box-orient: vertical;
          overflow: hidden;
        }
      `}</style>
    </div>
  )
}