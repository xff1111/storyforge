import { Routes, Route } from 'react-router-dom'
import HomePage from './pages/HomePage'
import WorkspacePage from './pages/WorkspacePage'
import { useVersionCheck } from './hooks/useVersionCheck'
import { UpdateNotification } from './components/UpdateNotification'

export default function App() {
  const { versionInfo, checkForUpdates } = useVersionCheck()

  return (
    <>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/workspace/:projectId" element={<WorkspacePage />} />
      </Routes>
      
      {versionInfo && (
        <UpdateNotification 
          versionInfo={versionInfo} 
          onRefresh={checkForUpdates} 
        />
      )}
    </>
  )
}
