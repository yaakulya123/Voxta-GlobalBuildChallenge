"use client";

import * as React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Loader2, Headphones, Video, Monitor } from "lucide-react";

// Validation schema tailored for Voxta
const formSchema = z.object({
  displayName: z.string().min(2, { message: "Name must be at least 2 characters." }),
  roomCode: z.string().min(1, { message: "Room Code is required." }),
  role: z.enum(['hearing', 'deaf']),
});

type FormValues = z.infer<typeof formSchema>;

interface AuthFormSplitScreenProps {
  logo: React.ReactNode;
  title: string;
  description: string;
  imageSrc: string;
  imageAlt: string;
  onSubmit: (data: FormValues) => Promise<void>;
}

export function AuthFormSplitScreen({
  logo,
  title,
  description,
  imageSrc,
  imageAlt,
  onSubmit,
}: AuthFormSplitScreenProps) {
  const [isLoading, setIsLoading] = React.useState(false);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      displayName: "",
      roomCode: "",
      role: "hearing",
    },
  });

  const handleFormSubmit = async (data: FormValues) => {
    setIsLoading(true);
    try {
      await onSubmit(data);
    } catch (error) {
      console.error("Submission failed:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: { opacity: 1, transition: { staggerChildren: 0.1 } },
  };

  const itemVariants = {
    hidden: { y: 20, opacity: 0 },
    visible: { y: 0, opacity: 1 },
  };

  return (
    <div className="relative flex min-h-screen w-full flex-col md:flex-row bg-[#0E1015]">
      {/* Left Panel: Form */}
      <div className="flex w-full flex-col items-center justify-center p-8 lg:w-1/2">
        <div className="w-full max-w-md relative z-10">
          <motion.div
            variants={containerVariants}
            initial="hidden"
            animate="visible"
            className="flex flex-col gap-6"
          >
            <motion.div variants={itemVariants} className="mb-2">
              {logo}
            </motion.div>
            <motion.div variants={itemVariants} className="text-left mb-2">
              <h1 className="text-3xl font-bold tracking-tight text-white mb-2">{title}</h1>
              <p className="text-sm text-white/60">{description}</p>
            </motion.div>

            <Form {...form}>
              <form
                onSubmit={form.handleSubmit(handleFormSubmit)}
                className="space-y-5"
              >
                <motion.div variants={itemVariants}>
                  <FormField
                    control={form.control}
                    name="displayName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-white/70">Display Name</FormLabel>
                        <FormControl>
                          <Input
                            placeholder="e.g. Alice"
                            className="bg-[#13151A] border-white/10 text-white placeholder:text-white/20 h-12 rounded-xl focus-visible:ring-blue-500"
                            {...field}
                            disabled={isLoading}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </motion.div>

                <motion.div variants={itemVariants}>
                  <FormField
                    control={form.control}
                    name="roomCode"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-white/70">Room Code</FormLabel>
                        <FormControl>
                          <Input
                            placeholder="e.g. 04"
                            className="bg-[#13151A] border-white/10 text-white placeholder:text-white/20 h-12 rounded-xl focus-visible:ring-blue-500"
                            {...field}
                            disabled={isLoading}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </motion.div>

                <motion.div variants={itemVariants}>
                  <FormField
                    control={form.control}
                    name="role"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-white/70 block mb-3">Participation Role</FormLabel>
                        <FormControl>
                          <div className="grid grid-cols-2 gap-3">
                            <button
                              type="button"
                              onClick={() => field.onChange('hearing')}
                              className={`flex flex-col items-center justify-center gap-2 py-4 rounded-xl border transition-all ${
                                field.value === 'hearing'
                                  ? 'bg-blue-500/10 border-blue-500 text-white'
                                  : 'bg-[#13151A] border-white/10 text-white/50 hover:bg-white/5'
                              }`}
                            >
                              <Headphones className="w-5 h-5" />
                              <span className="text-sm font-medium">Typical</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => field.onChange('deaf')}
                              className={`flex flex-col items-center justify-center gap-2 py-4 rounded-xl border transition-all ${
                                field.value === 'deaf'
                                  ? 'bg-blue-500/10 border-blue-500 text-white'
                                  : 'bg-[#13151A] border-white/10 text-white/50 hover:bg-white/5'
                              }`}
                            >
                              <Video className="w-5 h-5" />
                              <span className="text-sm font-medium">Person of Determination</span>
                            </button>
                          </div>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </motion.div>

                <motion.div variants={itemVariants} className="pt-2">
                  <Button 
                    type="submit" 
                    className="w-full h-12 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl shadow-lg shadow-blue-500/20" 
                    disabled={isLoading}
                  >
                    {isLoading && (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    )}
                    Join Secure Room
                  </Button>
                </motion.div>
              </form>
            </Form>

            <motion.div variants={itemVariants} className="mt-4 flex items-center justify-center gap-2 text-white/40 text-xs font-medium">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 12 2 2 4-4"/></svg>
              <span>E2E Encrypted WebRTC Connection</span>
            </motion.div>
          </motion.div>
        </div>
      </div>

      {/* Right Panel: Image */}
      <div className="relative hidden lg:block lg:w-1/2 p-4">
        <div className="h-full w-full relative rounded-3xl overflow-hidden shadow-2xl border border-white/10">
          <img
            src={imageSrc}
            alt={imageAlt}
            className="absolute inset-0 h-full w-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-[#0E1015] via-transparent to-transparent opacity-90" />
          <div className="absolute inset-0 bg-blue-500/10 mix-blend-overlay" />
          
          <div className="absolute bottom-16 left-12 right-12 text-white">
            <h2 className="text-4xl font-bold mb-4 drop-shadow-lg text-white">Real-Time. Accessible. Limitless.</h2>
            <p className="text-lg text-white/80 drop-shadow-md max-w-lg">
              Experience the power of instant real-time ASL translation and AI-summarized meetings inside a secure enterprise-grade WebRTC platform.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
