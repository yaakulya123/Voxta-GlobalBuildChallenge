import { Routes, Route, Navigate } from 'react-router-dom';
import CallRoom from './components/CallRoom';
import { Home } from './components/Home';

function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/room/:roomId" element={<CallRoom />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default App;
