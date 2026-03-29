import { BrowserRouter, Routes, Route } from 'react-router-dom'
import JoinScreen from './components/JoinScreen.jsx'
import CallRoom from './components/CallRoom.jsx'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<JoinScreen />} />
        <Route path="/room/:roomId" element={<CallRoom />} />
      </Routes>
    </BrowserRouter>
  )
}
