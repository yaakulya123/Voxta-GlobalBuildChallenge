import { useNavigate } from 'react-router-dom';
import { AuthFormSplitScreen } from './ui/login';

export const Home = () => {
  const navigate = useNavigate();

  const handleLogin = async (data: { displayName: string, roomCode: string }) => {
    navigate(`/room/${data.roomCode}?name=${encodeURIComponent(data.displayName)}`);
  };

  return (
    <AuthFormSplitScreen
      logo={
        <img src="/voxta-logo.png" alt="Voxta Logo" className="h-24 w-auto object-contain" />
      }
      title="Welcome to Voxta!"
      description="Enter your display name and room code to join the secure Global Build Challenge video channel."
      imageSrc="https://images.unsplash.com/photo-1573164713988-8665fc963095?ixlib=rb-4.0.3&auto=format&fit=crop&w=1200&q=80"
      imageAlt="A futuristic and modern aesthetic technology workspace that conveys connectivity and robust networking architecture."
      onSubmit={handleLogin}
    />
  );
};
