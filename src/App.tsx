import React, { useState, useEffect, Component } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Scissors, 
  Calendar, 
  Users, 
  Clock, 
  ChevronRight, 
  CheckCircle2, 
  Plus, 
  AlertCircle,
  Menu,
  X,
  Sparkles,
  MapPin,
  Phone,
  Instagram,
  LogOut,
  User as UserIcon,
  Trash2,
  Image as ImageIcon,
  ChevronLeft
} from 'lucide-react';
import { format, startOfWeek, addDays, isSameDay, parseISO, startOfMonth, endOfMonth, eachDayOfInterval } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { 
  onSnapshot, 
  collection, 
  addDoc, 
  updateDoc, 
  doc, 
  query, 
  where, 
  orderBy, 
  serverTimestamp, 
  setDoc, 
  getDoc,
  deleteDoc,
  Timestamp
} from 'firebase/firestore';
import { 
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  updateProfile,
  onAuthStateChanged, 
  signOut, 
  User as FirebaseUser 
} from 'firebase/auth';
import { db, auth } from './lib/firebase';
import { cn } from './lib/utils';

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: any;
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  // We throw a standardized JSON message for the system to catch
  throw new Error(JSON.stringify(errInfo));
}

interface ErrorBoundaryProps { children: React.ReactNode; }
interface ErrorBoundaryState { hasError: boolean; error: any; }

// Error Boundary Component
class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false, error: null };
  // @ts-ignore
  props: ErrorBoundaryProps;

  static getDerivedStateFromError(error: any): ErrorBoundaryState {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-brand-bg p-4">
          <div className="bg-white p-8 rounded-2xl shadow-xl max-w-md w-full text-center space-y-4">
            <div className="text-brand-accent mx-auto w-16 h-16 bg-red-50 rounded-full flex items-center justify-center">
              <AlertCircle size={32} />
            </div>
            <h2 className="text-xl font-bold">Algo deu errado</h2>
            <p className="text-brand-text-muted text-sm">Desculpe pelo transtorno. Ocorreu um erro no carregamento do sistema.</p>
            <button 
              onClick={() => window.location.reload()}
              className="bg-brand-primary text-white px-6 py-2 rounded-lg font-bold"
            >
              Recarregar Página
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

// Types
interface Service {
  id: string;
  name: string;
  price: string;
  duration: string;
  photoUrl: string;
  description: string;
}

interface Appointment {
  id: string;
  customerName: string;
  serviceId: string;
  date: string;
  time: string;
  status: 'scheduled' | 'completed' | 'cancelled';
  uid: string;
  createdAt: any;
}

interface UserProfile {
  uid: string;
  displayName: string | null;
  email: string | null;
  role: 'admin' | 'client';
  photoURL: string | null;
}

export default function App() {
  const [activeTab, setActiveTab] = useState<'home' | 'catalog' | 'booking' | 'admin'>('home');
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [services, setServices] = useState<Service[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Services listener
    // Seeding logic for initial services
    const seedServices = async () => {
      const servicesRef = collection(db, 'services');
      const q = query(servicesRef);
      const snapshot = await getDoc(doc(db, 'settings', 'seeded'));
      
      if (!snapshot.exists()) {
        const initialServices = [
          {
            name: 'Corte Feminino Premium',
            price: 'R$ 120',
            duration: '60 min',
            photoUrl: 'https://images.unsplash.com/photo-1562322140-8baeececf3df?q=80&w=800&auto=format&fit=crop',
            description: 'Corte estilizado com visagismo, lavagem relaxante e finalização com escova.'
          },
          {
            name: 'Coloração & Mechas',
            price: 'R$ 250',
            duration: '180 min',
            photoUrl: 'https://images.unsplash.com/photo-1560869713-7d0a294308d3?q=80&w=800&auto=format&fit=crop',
            description: 'Transformação completa de cor com produtos importados e proteção da fibra capilar.'
          },
          {
            name: 'Manicure e Pedicure Spa',
            price: 'R$ 90',
            duration: '90 min',
            photoUrl: 'https://images.unsplash.com/photo-1632345033849-5461281483ee?q=80&w=800&auto=format&fit=crop',
            description: 'Cuidado completo das unhas com esmaltação premium e massagem relaxante.'
          },
          {
            name: 'Escova Modeladora',
            price: 'R$ 70',
            duration: '45 min',
            photoUrl: 'https://images.unsplash.com/photo-1522336572468-97b06e8ef143?q=80&w=800&auto=format&fit=crop',
            description: 'O acabamento perfeito para qualquer ocasião. Brilho intenso e movimento.'
          },
          {
            name: 'Maquiagem Social',
            price: 'R$ 180',
            duration: '60 min',
            photoUrl: 'https://images.unsplash.com/photo-1487412720507-e7ab37603c6f?q=80&w=800&auto=format&fit=crop',
            description: 'Maquiagem profissional para eventos, realçando sua beleza natural com durabilidade.'
          },
          {
            name: 'Hidratação Profunda',
            price: 'R$ 100',
            duration: '40 min',
            photoUrl: 'https://images.unsplash.com/photo-1516975080664-ed2fc6a32937?q=80&w=800&auto=format&fit=crop',
            description: 'Tratamento intensivo para recuperação de brilho e maciez dos fios.'
          }
        ];

        for (const service of initialServices) {
          await addDoc(servicesRef, service);
        }
        await setDoc(doc(db, 'settings', 'seeded'), { done: true });
      }
    };
    seedServices();

    const unsubscribeServices = onSnapshot(collection(db, 'services'), (snapshot) => {
      const servicesData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Service[];
      setServices(servicesData);
    });

    return () => unsubscribeServices();
  }, []);

  useEffect(() => {
    // Test connection to Firestore
    const testConnection = async () => {
      try {
        const { getDocFromServer } = await import('firebase/firestore');
        await getDocFromServer(doc(db, '_connection_test_', 'ping'));
      } catch (error) {
        if (error instanceof Error && error.message.includes('permission-denied')) {
          // Normal if collection doesn't exist or rules block it
          console.log("Firebase connection established (Rules active).");
        } else if (error instanceof Error && error.message.includes('client is offline')) {
          console.error("Please check your Firebase configuration. The client is offline.");
        }
      }
    };
    testConnection();

    const unsubscribeAuth = onAuthStateChanged(auth, async (user) => {
      setUser(user);
      if (user) {
        const userRef = doc(db, 'users', user.uid);
        const userDoc = await getDoc(userRef);
        
        let profile: UserProfile;
        if (!userDoc.exists()) {
          const isAdmin = user.email === 'pontelikes14@gmail.com';
          profile = {
            uid: user.uid,
            displayName: user.displayName,
            email: user.email,
            role: isAdmin ? 'admin' : 'client',
            photoURL: user.photoURL
          };
          await setDoc(userRef, profile);
        } else {
          profile = userDoc.data() as UserProfile;
          // Security layer: Force admin role if email matches the hardcoded admin
          if (user.email === 'pontelikes14@gmail.com' && profile.role !== 'admin') {
            profile.role = 'admin';
            await setDoc(userRef, { role: 'admin' }, { merge: true });
          }
        }
        setUserProfile(profile);
      } else {
        setUserProfile(null);
      }
      setLoading(false);
    });

    return () => unsubscribeAuth();
  }, []);

  useEffect(() => {
    if (!user) {
      setAppointments([]);
      return;
    }

    const qAppts = userProfile?.role === 'admin' 
      ? query(collection(db, 'appointments'), orderBy('createdAt', 'desc'))
      : query(collection(db, 'appointments'), where('uid', '==', user.uid), orderBy('createdAt', 'desc'));
      
    const unsubscribeAppts = onSnapshot(qAppts, (snapshot) => {
      const apptsData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Appointment[];
      setAppointments(apptsData);
    });

    return () => unsubscribeAppts();
  }, [user, userProfile]);

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    try {
      if (authMode === 'register') {
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        await updateProfile(userCredential.user, { displayName });
        
        // Finalize profile creation (already handled by onAuthStateChanged but we can force update here if needed)
        const userRef = doc(db, 'users', userCredential.user.uid);
        const isAdmin = email === 'pontelikes14@gmail.com';
        await setDoc(userRef, {
          uid: userCredential.user.uid,
          displayName: displayName,
          email: email,
          role: isAdmin ? 'admin' : 'client',
          photoURL: null
        });
      } else {
        await signInWithEmailAndPassword(auth, email, password);
      }
    } catch (error: any) {
      console.error("Auth error:", error);
      if (error.code === 'auth/invalid-credential') setErrorMsg('E-mail ou senha incorretos.');
      else if (error.code === 'auth/email-already-in-use') setErrorMsg('Este e-mail já está em uso.');
      else if (error.code === 'auth/weak-password') setErrorMsg('A senha deve ter pelo menos 6 caracteres.');
      else setErrorMsg('Erro na autenticação. Verifique se o provedor está ativo no console do Firebase.');
    }
  };

  const handleLogout = () => signOut(auth);

  const handleBook = async (data: Omit<Appointment, 'id' | 'status' | 'uid' | 'createdAt'>) => {
    if (!user) {
      handleLogin();
      return;
    }

    const path = 'appointments';
    try {
      await addDoc(collection(db, path), {
        ...data,
        status: 'scheduled',
        uid: user.uid,
        createdAt: serverTimestamp()
      });
      setActiveTab('home');
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, path);
    }
  };

  const handleUpdateAppointmentStatus = async (id: string, status: Appointment['status']) => {
    const path = `appointments/${id}`;
    const ref = doc(db, 'appointments', id);
    try {
      await updateDoc(ref, { status });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, path);
    }
  };

  const handleAddService = async (service: Omit<Service, 'id'>) => {
    if (userProfile?.role !== 'admin') return;
    try {
      await addDoc(collection(db, 'services'), service);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'services');
    }
  };

  const handleDeleteService = async (id: string) => {
    if (userProfile?.role !== 'admin') return;
    try {
      await deleteDoc(doc(db, 'services', id));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `services/${id}`);
    }
  };

  if (loading) {
    return (
      <ErrorBoundary>
        <div className="min-h-screen flex items-center justify-center bg-brand-bg">
          <div className="w-12 h-12 border-4 border-brand-primary border-t-transparent rounded-full animate-spin" />
        </div>
      </ErrorBoundary>
    );
  }

  if (!user) {
    return (
      <ErrorBoundary>
        <div className="min-h-screen bg-brand-bg flex items-center justify-center p-4">
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="max-w-md w-full bg-white p-10 rounded-3xl shadow-xl space-y-8"
          >
            <div className="w-20 h-20 bg-brand-secondary rounded-2xl flex items-center justify-center mx-auto text-brand-primary">
              <Sparkles size={40} />
            </div>
            <div className="space-y-2 text-center">
              <h1 className="text-3xl font-bold text-brand-text-dark">Agenda Fácil</h1>
              <p className="text-brand-text-muted">{authMode === 'login' ? 'Bem-vindo de volta!' : 'Crie sua conta no salão'}</p>
            </div>

            <form onSubmit={handleAuth} className="space-y-4">
              {authMode === 'register' && (
                <div className="space-y-1">
                  <label className="text-[10px] font-bold uppercase tracking-widest text-brand-text-muted px-1">Nome Completo</label>
                  <input 
                    required
                    type="text"
                    value={displayName}
                    onChange={e => setDisplayName(e.target.value)}
                    className="w-full bg-brand-bg border border-brand-border rounded-xl px-4 py-3 outline-none focus:border-brand-primary text-sm font-medium"
                    placeholder="Seu nome"
                  />
                </div>
              )}
              <div className="space-y-1">
                <label className="text-[10px] font-bold uppercase tracking-widest text-brand-text-muted px-1">E-mail</label>
                <input 
                  required
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  className="w-full bg-brand-bg border border-brand-border rounded-xl px-4 py-3 outline-none focus:border-brand-primary text-sm font-medium"
                  placeholder="exemplo@email.com"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-bold uppercase tracking-widest text-brand-text-muted px-1">Senha</label>
                <input 
                  required
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  className="w-full bg-brand-bg border border-brand-border rounded-xl px-4 py-3 outline-none focus:border-brand-primary text-sm font-medium"
                  placeholder="••••••••"
                />
                {authMode === 'register' && <p className="text-[10px] text-brand-text-muted mt-1 px-1 italic">* Mínimo 6 caracteres</p>}
              </div>

              {errorMsg && (
                <div className="p-3 bg-red-50 text-red-600 rounded-xl text-xs font-bold border border-red-100 flex items-center gap-2">
                  <AlertCircle size={14} /> {errorMsg}
                </div>
              )}

              <button 
                type="submit"
                className="w-full bg-brand-primary text-white py-4 rounded-xl font-bold hover:scale-[1.02] transition-all shadow-lg shadow-brand-primary/20"
              >
                {authMode === 'login' ? 'Entrar' : 'Cadastrar'}
              </button>
            </form>

            <div className="pt-4 border-t border-brand-border text-center">
              <button 
                onClick={() => {
                  setAuthMode(authMode === 'login' ? 'register' : 'login');
                  setErrorMsg('');
                }}
                className="text-xs font-bold text-brand-text-muted hover:text-brand-primary transition-colors"
              >
                {authMode === 'login' 
                  ? 'Não tem conta? Cadastre-se' 
                  : 'Já tem conta? Faça Login'}
              </button>
            </div>
          </motion.div>
        </div>
      </ErrorBoundary>
    );
  }

  return (
    <ErrorBoundary>
      <div className="min-h-screen bg-brand-bg flex flex-col">
      {/* Navigation */}
      <nav className="sticky top-0 z-50 bg-white border-b border-brand-border h-20">
        <div className="max-w-7xl mx-auto px-6 h-full flex items-center justify-between">
          <button 
            onClick={() => setActiveTab('home')}
            className="flex items-center gap-3"
          >
            <div className="w-10 h-10 bg-brand-primary rounded-lg flex items-center justify-center text-white shadow-lg shadow-brand-primary/20">
              <Sparkles size={20} />
            </div>
            <span className="text-xl font-bold tracking-tight text-brand-primary uppercase">Agenda Fácil</span>
          </button>

          {/* Desktop Nav */}
          <div className="hidden md:flex items-center gap-2">
            <NavButton active={activeTab === 'home'} onClick={() => setActiveTab('home')}>Painel Geral</NavButton>
            <NavButton active={activeTab === 'catalog'} onClick={() => setActiveTab('catalog')}>Serviços</NavButton>
            <NavButton active={activeTab === 'booking'} onClick={() => setActiveTab('booking')}>Agendamentos</NavButton>
            {userProfile?.role === 'admin' && (
              <button 
                onClick={() => setActiveTab('admin')}
                className="ml-4 px-4 py-2 text-xs font-semibold uppercase tracking-wider text-brand-text-muted hover:text-brand-primary transition-colors border border-transparent hover:border-brand-border rounded-lg"
              >
                Admin
              </button>
            )}
          </div>

          <div className="hidden md:flex items-center gap-4 pl-8 border-l border-brand-border">
            <div className="text-right leading-none">
              <div className="text-sm font-bold">{userProfile?.role === 'admin' ? 'Administrador' : user.displayName}</div>
              <div className="text-[11px] text-brand-text-muted mt-1 uppercase tracking-wider font-semibold">{userProfile?.role === 'admin' ? 'Acesso Total' : 'Perfil Premium'}</div>
            </div>
            <button onClick={handleLogout} className="relative group">
              <img 
                src={user.photoURL || "https://picsum.photos/seed/user1/100/100"} 
                alt="Avatar" 
                className="w-10 h-10 rounded-full border-2 border-brand-border group-hover:opacity-50 transition-opacity"
                referrerPolicy="no-referrer"
              />
              <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                <LogOut size={16} className="text-brand-primary" />
              </div>
            </button>
          </div>

          <button className="md:hidden" onClick={() => setIsMenuOpen(!isMenuOpen)}>
            {isMenuOpen ? <X /> : <Menu />}
          </button>
        </div>
      </nav>

      {/* Mobile Menu */}
      <AnimatePresence>
        {isMenuOpen && (
          <motion.div 
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="fixed inset-0 z-40 bg-brand-bg pt-20 px-4 md:hidden"
          >
            <div className="flex flex-col gap-6 text-center">
              <MobileNavButton active={activeTab === 'home'} onClick={() => { setActiveTab('home'); setIsMenuOpen(false); }}>Início</MobileNavButton>
              <MobileNavButton active={activeTab === 'catalog'} onClick={() => { setActiveTab('catalog'); setIsMenuOpen(false); }}>Serviços</MobileNavButton>
              <MobileNavButton active={activeTab === 'booking'} onClick={() => { setActiveTab('booking'); setIsMenuOpen(false); }}>Agendar</MobileNavButton>
              {userProfile?.role === 'admin' && (
                <MobileNavButton active={activeTab === 'admin'} onClick={() => { setActiveTab('admin'); setIsMenuOpen(false); }}>Painel Admin</MobileNavButton>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <main className="flex-1 max-w-7xl mx-auto w-full px-4 py-8">
        <AnimatePresence mode="wait">
          {activeTab === 'home' && (
            <motion.div key="home" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <HomeView 
                onStart={() => setActiveTab('catalog')} 
                appointments={appointments} 
                services={services}
                onCancelAppt={handleUpdateAppointmentStatus}
              />
            </motion.div>
          )}
          {activeTab === 'catalog' && (
            <motion.div key="catalog" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <CatalogView 
                services={services}
                onSelect={() => setActiveTab('booking')} 
              />
            </motion.div>
          )}
          {activeTab === 'booking' && (
            <motion.div key="booking" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <BookingForm onBook={handleBook} services={services} />
            </motion.div>
          )}
          {activeTab === 'admin' && (
            <motion.div key="admin" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <AdminView 
                appointments={appointments}
                services={services}
                onUpdateAppointmentStatus={handleUpdateAppointmentStatus}
                onAddService={handleAddService}
                onDeleteService={handleDeleteService}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      <footer className="bg-stone-900 text-stone-400 py-12 px-4">
        <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-12">
          <div>
            <h3 className="text-white text-xl mb-4">Agenda Fácil</h3>
            <p className="text-sm leading-relaxed">Onde a praticidade encontra o bem-estar. Venha viver uma experiência única de cuidado e transformação.</p>
          </div>
          <div className="space-y-4">
            <h4 className="text-white text-sm uppercase tracking-widest font-sans font-semibold">Localização</h4>
            <div className="flex items-start gap-2 text-sm">
              <MapPin size={18} className="shrink-0" />
              <span>Rua das Flores, 123 - Centro<br />São Paulo, SP</span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <Phone size={18} />
              <span>(11) 98765-4321</span>
            </div>
          </div>
          <div className="space-y-4">
            <h4 className="text-white text-sm uppercase tracking-widest font-sans font-semibold">Social</h4>
            <a href="#" className="flex items-center gap-2 hover:text-white transition-colors">
              <Instagram size={18} />
              <span>@espaco_glow</span>
            </a>
          </div>
        </div>
        <div className="max-w-7xl mx-auto mt-12 pt-8 border-t border-stone-800 text-xs text-center">
          © {new Date().getFullYear()} Agenda Fácil. Todos os direitos reservados.
        </div>
      </footer>
    </div>
    </ErrorBoundary>
  );
}

function NavButton({ children, active, onClick }: { children: React.ReactNode, active: boolean, onClick: () => void }) {
  return (
    <button 
      onClick={onClick}
      className={cn(
        "px-4 py-2 text-sm font-semibold transition-all rounded-lg",
        active 
          ? "text-brand-primary bg-brand-secondary" 
          : "text-brand-text-muted hover:text-brand-primary hover:bg-brand-secondary/50"
      )}
    >
      {children}
    </button>
  );
}

function MobileNavButton({ children, active, onClick }: { children: React.ReactNode, active: boolean, onClick: () => void }) {
  return (
    <button 
      onClick={onClick}
      className={cn(
        "text-3xl font-serif transition-colors",
        active ? "text-brand-primary" : "text-stone-500"
      )}
    >
      {children}
    </button>
  );
}

function HomeView({ onStart, appointments, services, onCancelAppt }: { onStart: () => void, appointments: Appointment[], services: Service[], onCancelAppt: (id: string, s: Appointment['status']) => void }) {
  const myAppts = appointments.filter(a => a.status === 'scheduled');

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="space-y-8"
    >
      <section className="bg-gradient-to-br from-brand-primary to-[#9B59B6] text-white p-10 rounded-2xl shadow-xl space-y-4">
        <div className="text-xs font-bold uppercase tracking-[2px] opacity-80">Próximo Agendamento</div>
        <h1 className="text-4xl font-bold">
          {myAppts.length > 0 
            ? `Você tem ${myAppts.length} agendamento${myAppts.length > 1 ? 's' : ''}` 
            : "Pronto para sua transformação?"}
        </h1>
        <p className="text-base opacity-90 max-w-lg">Reserve seu horário e garanta um atendimento exclusivo no Agenda Fácil.</p>
        <div className="pt-4">
          <button 
            onClick={onStart}
            className="bg-white text-brand-primary px-8 py-3 rounded-xl font-bold text-sm uppercase tracking-tighter hover:bg-brand-secondary transition-all"
          >
            Agendar Agora
          </button>
        </div>
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-6">
          <div className="flex justify-between items-center">
            <h2 className="text-lg font-bold text-brand-text-dark">Serviços em Destaque</h2>
            <button onClick={onStart} className="text-brand-primary text-sm font-bold hover:underline">Ver catálogo</button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {services.slice(0, 4).map(s => (
              <div key={s.id} className="bg-white p-4 rounded-xl border border-brand-border flex items-center gap-4">
                <img src={s.photoUrl || "https://picsum.photos/seed/hair/100/100"} className="w-16 h-16 rounded-lg object-cover" alt={s.name} referrerPolicy="no-referrer" />
                <div className="flex flex-col gap-0.5">
                  <div className="font-bold text-sm">{s.name}</div>
                  <div className="text-brand-primary font-extrabold text-sm">{s.price}</div>
                  <div className="text-[10px] text-brand-text-muted uppercase tracking-wider font-semibold">
                    {s.duration}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
        
        <div className="space-y-6">
          <div className="flex justify-between items-center">
            <h2 className="text-lg font-bold text-brand-text-dark">Sua Agenda</h2>
            <span className="bg-brand-accent text-white text-[10px] px-2 py-0.5 rounded-full font-bold">MEUS HORÁRIOS</span>
          </div>
          
          <div className="space-y-3">
            {myAppts.length === 0 ? (
              <div className="bg-white border border-brand-border rounded-xl p-8 text-center">
                <Calendar className="mx-auto text-brand-text-muted opacity-20 mb-2" size={32} />
                <p className="text-xs text-brand-text-muted font-medium">Você ainda não possui agendamentos ativos.</p>
              </div>
            ) : (
              myAppts.map(appt => {
                const s = services.find(sv => sv.id === appt.serviceId);
                return (
                  <div key={appt.id} className="bg-white border border-brand-border rounded-xl p-5 border-l-4 border-l-brand-primary relative group">
                    <div className="text-[10px] text-brand-text-muted font-bold uppercase mb-1">{format(parseISO(appt.date), "dd 'de' MMMM", { locale: ptBR })} às {appt.time}</div>
                    <div className="font-bold text-brand-text-dark">{s?.name || 'Serviço'}</div>
                    <div className="text-[11px] text-stone-500 uppercase tracking-widest font-bold mt-1">Status: {appt.status}</div>
                    
                    <button 
                      onClick={() => onCancelAppt(appt.id, 'cancelled')}
                      className="absolute top-4 right-4 text-brand-text-muted hover:text-brand-accent transition-colors opacity-0 group-hover:opacity-100"
                      title="Cancelar agendamento"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </motion.div>
  );
}

function CatalogView({ services, onSelect }: { services: Service[], onSelect: (s: Service) => void }) {
  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="space-y-8"
    >
      <div className="flex justify-between items-end border-b border-brand-border pb-6">
        <div>
          <h2 className="text-2xl font-bold uppercase tracking-tighter">Nosso Catálogo</h2>
          <p className="text-brand-text-muted text-sm px-1 font-medium">Experiências exclusivas desenhadas para você.</p>
        </div>
        <span className="bg-brand-secondary text-brand-primary px-4 py-1.5 rounded-full text-[10px] font-extrabold uppercase tracking-widest">
          {services.length} Procedimentos
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
        {services.map((service, idx) => (
          <motion.div 
            key={service.id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: idx * 0.05 }}
            className="group"
          >
            <div className="bg-white rounded-2xl overflow-hidden border border-brand-border shadow-sm hover:shadow-xl transition-all duration-500 flex flex-col h-full">
              <div className="relative h-48 overflow-hidden">
                <img 
                  src={service.photoUrl || `https://picsum.photos/seed/${service.id}/600/400`} 
                  className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700" 
                  alt={service.name} 
                  referrerPolicy="no-referrer"
                />
                <div className="absolute top-4 right-4 bg-white/90 backdrop-blur px-3 py-1 rounded-full text-brand-primary font-extrabold text-sm shadow-sm">
                  {service.price}
                </div>
              </div>
              <div className="p-6 flex flex-col flex-1">
                <h3 className="text-lg font-bold text-brand-text-dark mb-1">{service.name}</h3>
                <div className="text-[10px] text-brand-primary font-extrabold uppercase tracking-[2px] mb-3">
                  {service.duration} • Profissional
                </div>
                <p className="text-stone-500 text-sm leading-relaxed mb-6 line-clamp-3">{service.description}</p>
                <div className="mt-auto">
                  <button 
                    onClick={() => onSelect(service)}
                    className="w-full bg-brand-primary text-white py-3.5 rounded-xl font-bold text-xs tracking-[2px] uppercase hover:brightness-110 transition-all shadow-lg shadow-brand-primary/10"
                  >
                    Reserva Imediata
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
        ))}
      </div>
    </motion.div>
  );
}

function BookingForm({ onBook, services }: { onBook: (a: any) => void, services: Service[] }) {
  const [formData, setFormData] = useState({
    customerName: auth.currentUser?.displayName || '',
    serviceId: '',
    date: format(new Date(), 'yyyy-MM-dd'),
    time: ''
  });

  return (
    <motion.div 
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      className="max-w-2xl mx-auto bg-white p-10 rounded-2xl border border-brand-border shadow-sm"
    >
      <div className="mb-10 text-center border-b border-brand-border pb-8">
        <h2 className="text-2xl font-bold text-brand-text-dark uppercase tracking-tighter">Agendar Horário</h2>
        <p className="text-brand-text-muted text-sm mt-1 font-medium">Escolha seu momento de brilhar.</p>
      </div>

      <form className="space-y-8" onSubmit={(e) => { e.preventDefault(); onBook(formData); }}>
        <div className="space-y-3">
          <label className="text-[10px] uppercase tracking-[2px] font-extrabold text-brand-text-muted">Seu Nome</label>
          <input 
            required
            className="w-full bg-brand-bg border-brand-border rounded-xl px-4 py-4 outline-none focus:ring-2 focus:ring-brand-primary/10 transition-all border text-sm font-medium"
            placeholder="Como podemos te chamar?"
            value={formData.customerName}
            onChange={e => setFormData({ ...formData, customerName: e.target.value })}
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <div className="space-y-3">
            <label className="text-[10px] uppercase tracking-[2px] font-extrabold text-brand-text-muted">Serviço</label>
            <select 
              required
              className="w-full bg-brand-bg border-brand-border rounded-xl px-4 py-4 outline-none border text-sm appearance-none font-medium cursor-pointer"
              value={formData.serviceId}
              onChange={e => setFormData({ ...formData, serviceId: e.target.value })}
            >
              <option value="">Selecione...</option>
              {services.map(s => <option key={s.id} value={s.id}>{s.name} - {s.price}</option>)}
            </select>
          </div>
          
          <div className="space-y-3">
            <label className="text-[10px] uppercase tracking-[2px] font-extrabold text-brand-text-muted">Data</label>
            <input 
              required
              type="date"
              min={format(new Date(), 'yyyy-MM-dd')}
              className="w-full bg-brand-bg border-brand-border rounded-xl px-4 py-4 outline-none border text-sm font-medium"
              value={formData.date}
              onChange={e => setFormData({ ...formData, date: e.target.value })}
            />
          </div>
        </div>

        <div className="space-y-4">
          <label className="text-[10px] uppercase tracking-[2px] font-extrabold text-brand-text-muted">Horários Disponíveis</label>
          <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">
            {['09:00', '10:00', '11:00', '13:00', '14:00', '15:00', '16:00', '17:00', '18:00', '19:00'].map(t => (
              <button
                key={t}
                type="button"
                onClick={() => setFormData({ ...formData, time: t })}
                className={cn(
                  "py-3 rounded-lg text-xs font-bold transition-all border",
                  formData.time === t 
                    ? "bg-brand-primary text-white border-brand-primary shadow-xl shadow-brand-primary/20 scale-105" 
                    : "bg-white text-stone-600 border-brand-border hover:border-brand-primary hover:text-brand-primary"
                )}
              >
                {t}
              </button>
            ))}
          </div>
        </div>

        <button 
          type="submit"
          className="w-full bg-brand-primary text-white py-5 rounded-2xl font-bold text-xs tracking-[4px] uppercase hover:scale-[1.01] active:scale-[0.99] transition-all mt-6 shadow-2xl shadow-brand-primary/30"
        >
          Confirmar Reserva
        </button>
      </form>
    </motion.div>
  );
}

function AdminView({ 
  appointments, 
  services,
  onUpdateAppointmentStatus,
  onAddService,
  onDeleteService
}: { 
  appointments: Appointment[],
  services: Service[],
  onUpdateAppointmentStatus: (id: string, s: Appointment['status']) => void,
  onAddService: (s: any) => void,
  onDeleteService: (id: string) => void
}) {
  const [activeSection, setActiveSection] = useState<'calendar' | 'services' | 'stats'>('calendar');
  const [currentDate, setCurrentDate] = useState(new Date());

  // Metrics
  const today = format(new Date(), 'yyyy-MM-dd');
  const todayAppts = appointments.filter(a => a.date === today && a.status !== 'cancelled');
  const totalRevenue = todayAppts.reduce((acc, curr) => {
    const s = services.find(sv => sv.id === curr.serviceId);
    return acc + (s ? parseInt(s.price.replace(/\D/g, '')) : 0);
  }, 0);

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <h2 className="text-3xl font-bold text-brand-text-dark tracking-tighter">Painel do Salão</h2>
          <p className="text-brand-text-muted text-sm font-medium">Interface administrativa de alta performance.</p>
        </div>
        <div className="flex bg-white p-1 rounded-2xl border border-brand-border shadow-sm">
          {[
            { id: 'calendar', label: 'Agenda', icon: <Calendar size={14} /> },
            { id: 'services', label: 'Serviços', icon: <Scissors size={14} /> },
            { id: 'stats', label: 'Dashboard', icon: <Sparkles size={14} /> }
          ].map(tab => (
            <button 
              key={tab.id}
              onClick={() => setActiveSection(tab.id as any)}
              className={cn(
                "px-5 py-2.5 rounded-xl text-[10px] font-extrabold uppercase tracking-widest transition-all flex items-center gap-2",
                activeSection === tab.id ? "bg-brand-primary text-white shadow-lg shadow-brand-primary/20" : "text-brand-text-muted hover:bg-brand-secondary/50"
              )}
            >
              {tab.icon} {tab.label}
            </button>
          ))}
        </div>
      </div>

      <AnimatePresence mode="wait">
        {activeSection === 'calendar' && (
          <motion.div key="cal" initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 10 }}>
            <CalendarSection 
              appointments={appointments} 
              services={services} 
              onUpdateStatus={onUpdateAppointmentStatus} 
              currentDate={currentDate}
              setCurrentDate={setCurrentDate}
            />
          </motion.div>
        )}
        {activeSection === 'services' && (
          <motion.div key="srv" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}>
            <ServiceManager services={services} onAdd={onAddService} onDelete={onDeleteService} />
          </motion.div>
        )}
        {activeSection === 'stats' && (
          <motion.div key="sta" initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.98 }}>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              <DashboardStat title="Receita Hoje" value={`R$ ${totalRevenue}`} subtitle="Total processado" icon={<Sparkles className="text-brand-primary" />} />
              <DashboardStat title="Agendamentos" value={todayAppts.length.toString()} subtitle="Para hoje" icon={<Users className="text-blue-500" />} />
              <DashboardStat title="Capacidade" value={`${Math.min(100, (todayAppts.length * 10))}%`} subtitle="Ocupação da agenda" icon={<Clock className="text-amber-500" />} />
              <DashboardStat title="Cancelamentos" value={appointments.filter(a => a.status === 'cancelled').length.toString()} subtitle="Histórico total" icon={<X className="text-brand-accent" />} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function CalendarSection({ 
  appointments, 
  services, 
  onUpdateStatus,
  currentDate,
  setCurrentDate
}: { 
  appointments: Appointment[], 
  services: Service[], 
  onUpdateStatus: (id: string, s: any) => void,
  currentDate: Date,
  setCurrentDate: (d: Date) => void
}) {
  const dateStr = format(currentDate, 'yyyy-MM-dd');
  const dayAppts = appointments.filter(a => a.date === dateStr).sort((a,b) => a.time.localeCompare(b.time));

  const weekStart = startOfWeek(currentDate, { weekStartsOn: 0 });
  const weekDays = [...Array(7)].map((_, i) => addDays(weekStart, i));

  return (
    <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
      <div className="lg:col-span-1 space-y-6">
        <div className="bg-white p-6 rounded-2xl border border-brand-border shadow-sm">
          <div className="flex items-center justify-between mb-6">
            <button onClick={() => setCurrentDate(addDays(currentDate, -7))} className="p-2 hover:bg-brand-bg rounded-lg transition-all"><ChevronLeft size={18} /></button>
            <span className="text-xs font-bold uppercase tracking-widest">{format(currentDate, 'MMMM yyyy', { locale: ptBR })}</span>
            <button onClick={() => setCurrentDate(addDays(currentDate, 7))} className="p-2 hover:bg-brand-bg rounded-lg transition-all"><ChevronRight size={18} /></button>
          </div>
          <div className="grid grid-cols-7 gap-1 text-center mb-4">
            {['D', 'S', 'T', 'Q', 'Q', 'S', 'S'].map(d => (
              <div key={d} className="text-[10px] font-extrabold text-brand-text-muted">{d}</div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {weekDays.map(day => (
              <button 
                key={day.toISOString()}
                onClick={() => setCurrentDate(day)}
                className={cn(
                  "aspect-square flex flex-col items-center justify-center rounded-lg text-xs font-bold transition-all relative",
                  isSameDay(day, currentDate) ? "bg-brand-primary text-white shadow-lg shadow-brand-primary/20 scale-110" : "hover:bg-brand-bg text-brand-text-dark",
                  isSameDay(day, new Date()) && !isSameDay(day, currentDate) && "text-brand-primary underline"
                )}
              >
                {format(day, 'd')}
                {appointments.some(a => a.date === format(day, 'yyyy-MM-dd')) && !isSameDay(day, currentDate) && (
                  <div className="absolute bottom-1 w-1 h-1 bg-brand-primary rounded-full" />
                )}
              </button>
            ))}
          </div>
        </div>
        
        <div className="bg-white p-6 rounded-2xl border border-brand-border shadow-sm">
          <h4 className="text-[10px] font-extrabold uppercase tracking-[2px] mb-4 text-brand-text-muted">Legenda</h4>
          <div className="space-y-3">
            <div className="flex items-center gap-3 text-xs font-medium"><div className="w-2 h-2 rounded-full bg-blue-500" /> Agendado</div>
            <div className="flex items-center gap-3 text-xs font-medium"><div className="w-2 h-2 rounded-full bg-emerald-500" /> Concluído</div>
            <div className="flex items-center gap-3 text-xs font-medium"><div className="w-2 h-2 rounded-full bg-red-500" /> Cancelado</div>
          </div>
        </div>
      </div>

      <div className="lg:col-span-3 space-y-4">
        <div className="flex justify-between items-center mb-2">
           <h3 className="font-bold text-xl tracking-tight">Horários de {format(currentDate, "EEEE, dd 'de' MMMM", { locale: ptBR })}</h3>
           <div className="text-[10px] font-extrabold uppercase tracking-widest bg-brand-bg px-3 py-1 rounded-full border border-brand-border">
             {dayAppts.length} Atendimentos
           </div>
        </div>

        {dayAppts.length === 0 ? (
          <div className="bg-white p-20 rounded-3xl border-2 border-dashed border-brand-border text-center">
            <div className="w-16 h-16 bg-brand-bg rounded-2xl flex items-center justify-center mx-auto mb-4 text-brand-text-muted opacity-20">
              <Calendar size={32} />
            </div>
            <p className="text-sm font-medium text-brand-text-muted">Nenhum agendamento encontrado para esta data.</p>
          </div>
        ) : (
          dayAppts.map(appt => {
            const s = services.find(sv => sv.id === appt.serviceId);
            return (
              <div key={appt.id} className="bg-white p-6 rounded-2xl border border-brand-border shadow-sm flex items-center justify-between group hover:border-brand-primary/30 transition-all">
                <div className="flex items-center gap-8">
                  <div className="min-w-[60px] text-center">
                    <div className="text-xl font-bold text-brand-primary tracking-tighter">{appt.time}</div>
                    <div className="text-[9px] font-extrabold uppercase tracking-widest text-brand-text-muted">Horário</div>
                  </div>
                  <div className="h-10 w-px bg-brand-border" />
                  <div>
                    <h4 className="font-bold text-lg text-brand-text-dark">{appt.customerName}</h4>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-[10px] font-extrabold uppercase tracking-[1px] text-brand-text-muted">{s?.name || 'Serviço'}</span>
                      <span className="text-brand-primary font-bold text-xs tracking-tighter">{s?.price}</span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-6">
                   <div className={cn(
                     "px-3 py-1 rounded-full text-[9px] font-extrabold uppercase tracking-widest",
                     appt.status === 'scheduled' ? "bg-blue-50 text-blue-600" :
                     appt.status === 'completed' ? "bg-emerald-50 text-emerald-600" :
                     "bg-red-50 text-red-600"
                   )}>
                     {appt.status}
                   </div>
                   
                   {appt.status === 'scheduled' && (
                     <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button 
                          onClick={() => onUpdateStatus(appt.id, 'completed')}
                          className="p-2 bg-emerald-50 text-emerald-600 rounded-lg border border-emerald-100"
                          title="Finalizar"
                        >
                          <CheckCircle2 size={16} />
                        </button>
                        <button 
                          onClick={() => onUpdateStatus(appt.id, 'cancelled')}
                          className="p-2 bg-red-50 text-red-600 rounded-lg border border-red-100"
                          title="Cancelar"
                        >
                          <Trash2 size={16} />
                        </button>
                     </div>
                   )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

function ServiceManager({ services, onAdd, onDelete }: { services: Service[], onAdd: (s: any) => void, onDelete: (id: string) => void }) {
  const [isAdding, setIsAdding] = useState(false);
  const [newService, setNewService] = useState({
    name: '',
    price: 'R$ ',
    duration: '',
    description: '',
    photoUrl: ''
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onAdd(newService);
    setNewService({ name: '', price: 'R$ ', duration: '', description: '', photoUrl: '' });
    setIsAdding(false);
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h3 className="text-xl font-bold tracking-tight">Gestão de Serviços</h3>
        <button 
          onClick={() => setIsAdding(!isAdding)}
          className="bg-brand-primary text-white px-5 py-2.5 rounded-xl text-xs font-bold uppercase tracking-widest flex items-center gap-2 hover:scale-105 transition-all shadow-lg shadow-brand-primary/20"
        >
          {isAdding ? <X size={16} /> : <Plus size={16} />}
          {isAdding ? 'Cancelar' : 'Adicionar Serviço'}
        </button>
      </div>

      <AnimatePresence>
        {isAdding && (
          <motion.form 
            initial={{ height: 0, opacity: 0 }} 
            animate={{ height: 'auto', opacity: 1 }} 
            exit={{ height: 0, opacity: 0 }}
            className="bg-white p-8 rounded-3xl border border-brand-border shadow-sm space-y-6 overflow-hidden"
            onSubmit={handleSubmit}
          >
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              <Input label="Nome do Serviço" value={newService.name} onChange={v => setNewService({...newService, name: v})} placeholder="Ex: Corte Degradê" />
              <Input label="Preço" value={newService.price} onChange={v => setNewService({...newService, price: v})} placeholder="R$ 50" />
              <Input label="Duração" value={newService.duration} onChange={v => setNewService({...newService, duration: v})} placeholder="45 min" />
              <div className="md:col-span-2">
                <Input label="Descrição" value={newService.description} onChange={v => setNewService({...newService, description: v})} placeholder="Explique os detalhes do procedimento..." />
              </div>
              <Input label="URL da Foto" value={newService.photoUrl} onChange={v => setNewService({...newService, photoUrl: v})} placeholder="https://..." />
            </div>
            <button type="submit" className="w-full bg-brand-primary text-white py-4 rounded-xl font-extrabold text-[10px] tracking-[4px] uppercase">Salvar Serviço</button>
          </motion.form>
        )}
      </AnimatePresence>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {services.map(s => (
          <div key={s.id} className="bg-white p-6 rounded-2xl border border-brand-border flex items-center gap-6 group hover:shadow-md transition-all">
            <div className="w-24 h-24 rounded-xl overflow-hidden bg-brand-bg shrink-0">
               <img src={s.photoUrl || "https://picsum.photos/seed/salon/200/200"} className="w-full h-full object-cover" alt={s.name} referrerPolicy="no-referrer" />
            </div>
            <div className="flex-1">
               <div className="flex justify-between items-start">
                  <h4 className="font-bold text-brand-text-dark text-lg">{s.name}</h4>
                  <button onClick={() => onDelete(s.id)} className="text-brand-text-muted hover:text-brand-accent transition-colors"><Trash2 size={18} /></button>
               </div>
               <p className="text-xs text-brand-primary font-bold mb-2">{s.price} • {s.duration}</p>
               <p className="text-[11px] text-stone-500 line-clamp-2 leading-relaxed">{s.description}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Input({ label, value, onChange, placeholder }: { label: string, value: string, onChange: (v: string) => void, placeholder: string }) {
  return (
    <div className="space-y-2">
      <label className="text-[9px] uppercase tracking-[2px] font-extrabold text-brand-text-muted block ml-1">{label}</label>
      <input 
        className="w-full bg-brand-bg border-brand-border rounded-xl px-4 py-3 outline-none border focus:border-brand-primary transition-all text-xs font-medium" 
        value={value} 
        onChange={e => onChange(e.target.value)} 
        placeholder={placeholder} 
        required
      />
    </div>
  );
}

function DashboardStat({ title, value, subtitle, icon }: { title: string, value: string, subtitle: string, icon: React.ReactNode }) {
  return (
    <div className="bg-white p-8 rounded-3xl border border-brand-border shadow-sm hover:shadow-lg transition-all transform hover:-translate-y-1">
      <div className="w-12 h-12 bg-brand-bg rounded-2xl flex items-center justify-center mb-6 text-brand-primary">
        {icon}
      </div>
      <div>
        <p className="text-[10px] text-brand-text-muted font-extrabold uppercase tracking-[2px] mb-2">{title}</p>
        <p className="text-3xl font-bold text-brand-text-dark tracking-tighter">{value}</p>
        <p className="text-[10px] text-brand-text-muted mt-2 font-medium opacity-70 italic">{subtitle}</p>
      </div>
    </div>
  );
}
