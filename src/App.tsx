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
  getDocs,
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
  serviceName?: string;
  professionalId: string;
  professionalName?: string;
  date: string;
  time: string;
  status: 'scheduled' | 'completed' | 'cancelled';
  uid: string;
  createdAt: any;
}

interface Professional {
  id: string;
  name: string;
  photoUrl: string;
  serviceIds: string[];
}

interface SalonInfo {
  address: string;
  phone: string;
  instagram: string;
}

interface BlockedSlot {
  id: string;
  date: string;
  time: string;
  professionalId: string;
}

interface OccupiedSlot {
  id: string;
  date: string;
  time: string;
  professionalId: string;
  appointmentId: string;
}

interface AppConfig {
  availableDays: number[];
  availableHours: string[];
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
  const [professionals, setProfessionals] = useState<Professional[]>([]);
  const [config, setConfig] = useState<AppConfig>({
    availableDays: [1, 2, 3, 4, 5, 6], // Seg a Sáb
    availableHours: ['09:00', '10:00', '11:00', '13:00', '14:00', '15:00', '16:00', '17:00', '18:00', '19:00']
  });
  const [salonInfo, setSalonInfo] = useState<SalonInfo>({
    address: 'Rua das Flores, 123 - Centro, São Paulo, SP',
    phone: '(11) 98765-4321',
    instagram: '@agenda_facil'
  });
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [blockedSlots, setBlockedSlots] = useState<BlockedSlot[]>([]);
  const [occupiedSlots, setOccupiedSlots] = useState<OccupiedSlot[]>([]);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isLandingOpen, setIsLandingOpen] = useState(true);
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Services listener
    // Seeding logic for initial services, professionals and config
    const seedServices = async () => {
      // 1. Services Seed
      const servicesRef = collection(db, 'services');
      const serviceSnapshot = await getDoc(doc(db, 'settings', 'seeded_v2')); // Newer seed flag
      
      if (!serviceSnapshot.exists()) {
        const initialServices = [
          {
            name: 'Corte Feminino Premium',
            price: 'R$ 120',
            duration: '60 min',
            photoUrl: 'https://images.unsplash.com/photo-1562322140-8baeececf3df?q=80&w=800&auto=format&fit=crop',
            description: 'Corte estilizado com visagismo, lavagem relaxante e finalização com escova.'
          },
          {
            name: 'Manicure e Pedicure Spa',
            price: 'R$ 90',
            duration: '90 min',
            photoUrl: 'https://images.unsplash.com/photo-1632345033849-5461281483ee?q=80&w=800&auto=format&fit=crop',
            description: 'Cuidado completo das unhas com esmaltação premium e massagem relaxante.'
          }
        ];

        for (const service of initialServices) {
          await addDoc(servicesRef, service);
        }

        // 2. Professionals Seed
        const prosRef = collection(db, 'professionals');
        const initialPros = [
          { name: 'Ana Silva', role: 'Cabeleireira Especialista', photoUrl: 'https://images.unsplash.com/photo-1595959183082-a8a64937c2ff?q=80&w=400&fit=crop' },
          { name: 'Maria Santos', role: 'Manicure & Nail Designer', photoUrl: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?q=80&w=400&fit=crop' },
          { name: 'Julia Costa', role: 'Esteticista & Maquiadora', photoUrl: 'https://images.unsplash.com/photo-1554151228-14d9def656e4?q=80&w=400&fit=crop' }
        ];
        for (const pro of initialPros) {
          await addDoc(prosRef, pro);
        }

        // 3. Config Seed
        const configRef = doc(db, 'settings', 'availability');
        await setDoc(configRef, {
          availableDays: [1, 2, 3, 4, 5, 6],
          availableHours: ['09:00', '10:00', '11:00', '13:00', '14:00', '15:00', '16:00', '17:00', '18:00', '19:00']
        });

        // 4. Salon Info Seed
        const infoRef = doc(db, 'settings', 'info');
        await setDoc(infoRef, {
          address: 'Rua das Flores, 123 - Centro, São Paulo, SP',
          phone: '(11) 98765-4321',
          instagram: '@agenda_facil'
        });

        await setDoc(doc(db, 'settings', 'seeded_v2'), { done: true });
      }
    };
    seedServices();

    // Listeners
    const unsubscribeServices = onSnapshot(collection(db, 'services'), (snapshot) => {
      const servicesData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Service[];
      setServices(servicesData);
    });

    const unsubscribePros = onSnapshot(collection(db, 'professionals'), (snapshot) => {
      const prosData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Professional[];
      setProfessionals(prosData);
    });

    const unsubscribeConfig = onSnapshot(doc(db, 'settings', 'availability'), (doc) => {
      if (doc.exists()) {
        setConfig(doc.data() as AppConfig);
      }
    });

    const unsubscribeInfo = onSnapshot(doc(db, 'settings', 'info'), (doc) => {
      if (doc.exists()) {
        setSalonInfo(doc.data() as SalonInfo);
      }
    });

    const unsubscribeBlocked = onSnapshot(collection(db, 'blocked_slots'), (snapshot) => {
      const blockedData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as BlockedSlot[];
      setBlockedSlots(blockedData);
    });

    const unsubscribeOccupied = onSnapshot(collection(db, 'occupied_slots'), (snapshot) => {
      const occupiedData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as OccupiedSlot[];
      setOccupiedSlots(occupiedData);
    });

    return () => {
      unsubscribeServices();
      unsubscribePros();
      unsubscribeConfig();
      unsubscribeInfo();
      unsubscribeBlocked();
      unsubscribeOccupied();
    };
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
          const isAdmin = user.email === 'agendafaciladministrador@gmail.com';
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
          if (user.email === 'agendafaciladministrador@gmail.com' && profile.role !== 'admin') {
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
        const isAdmin = email === 'agendafaciladministrador@gmail.com';
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
    if (!user) return;

    const path = 'appointments';
    try {
      const docRef = await addDoc(collection(db, path), {
        ...data,
        status: 'scheduled',
        uid: user.uid,
        createdAt: serverTimestamp()
      });

      // Create a public occupied slot reference
      await addDoc(collection(db, 'occupied_slots'), {
        date: data.date,
        time: data.time,
        professionalId: data.professionalId,
        appointmentId: docRef.id
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

      // If cancelled, remove from occupied_slots
      if (status === 'cancelled') {
        const q = query(collection(db, 'occupied_slots'), where('appointmentId', '==', id));
        const occupiedSnapshot = await getDocs(q);
        occupiedSnapshot.forEach(async (d) => {
          await deleteDoc(doc(db, 'occupied_slots', d.id));
        });
      }
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

  if (!user && isLandingOpen) {
    return (
      <ErrorBoundary>
        <LandingPage onEnter={() => setIsLandingOpen(false)} salonInfo={salonInfo} services={services} />
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
              <BookingForm 
                onBook={handleBook} 
                services={services} 
                professionals={professionals}
                appointments={appointments}
                blockedSlots={blockedSlots}
                occupiedSlots={occupiedSlots}
                config={config}
              />
            </motion.div>
          )}
          {activeTab === 'admin' && (
            <motion.div key="admin" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <AdminView 
                appointments={appointments}
                blockedSlots={blockedSlots}
                services={services}
                professionals={professionals}
                config={config}
                salonInfo={salonInfo}
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
              <span>{salonInfo.address}</span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <Phone size={18} />
              <span>{salonInfo.phone}</span>
            </div>
          </div>
          <div className="space-y-4">
            <h4 className="text-white text-sm uppercase tracking-widest font-sans font-semibold">Social</h4>
            <a href="#" className="flex items-center gap-2 hover:text-white transition-colors">
              <Instagram size={18} />
              <span>{salonInfo.instagram}</span>
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

function BookingForm({ onBook, services, professionals, appointments, blockedSlots, occupiedSlots, config }: { 
  onBook: (a: any) => void, 
  services: Service[],
  professionals: Professional[],
  appointments: Appointment[],
  blockedSlots: BlockedSlot[],
  occupiedSlots: OccupiedSlot[],
  config: AppConfig
}) {
  const [formData, setFormData] = useState({
    customerName: auth.currentUser?.displayName || '',
    serviceId: '',
    professionalId: '',
    date: format(new Date(), 'yyyy-MM-dd'),
    time: ''
  });

  // Filter professionals by selected service
  const filteredProfessionals = professionals.filter(p => 
    !formData.serviceId || (p.serviceIds && p.serviceIds.includes(formData.serviceId))
  );

  // Calculate available slots
  const getAvailableSlots = () => {
    if (!formData.date || !formData.professionalId) return [];
    
    const now = new Date();
    const isToday = formData.date === format(now, 'yyyy-MM-dd');
    const currentTime = format(now, 'HH:mm');

    const dayOfWeek = parseISO(formData.date).getDay();
    if (!config.availableDays.includes(dayOfWeek)) return [];

    return config.availableHours.filter(slot => {
      // Check if slot is in the past today
      if (isToday && slot <= currentTime) return false;

      // Check if slot is taken by ANY appointment via occupiedSlots
      const isTakenByOthers = occupiedSlots.some(os => 
        os.date === formData.date && 
        os.time === slot && 
        os.professionalId === formData.professionalId
      );

      // Check if slot is blocked by admin
      const isBlocked = blockedSlots.some(bs => 
        bs.date === formData.date && 
        bs.time === slot && 
        bs.professionalId === formData.professionalId
      );

      return !isTakenByOthers && !isBlocked;
    });
  };

  const availableSlots = getAvailableSlots();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const service = services.find(s => s.id === formData.serviceId);
    const pro = professionals.find(p => p.id === formData.professionalId);
    
    onBook({
      ...formData,
      serviceName: service?.name,
      professionalName: pro?.name
    });
  };

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

      <form className="space-y-8" onSubmit={handleSubmit}>
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

          <div className="space-y-3 md:col-span-2">
            <label className="text-[10px] uppercase tracking-[2px] font-extrabold text-brand-text-muted">Profissional</label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {filteredProfessionals.map(p => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setFormData({ ...formData, professionalId: p.id, time: '' })}
                  className={cn(
                    "flex flex-col items-center p-4 rounded-2xl border transition-all space-y-3",
                    formData.professionalId === p.id 
                      ? "bg-brand-secondary border-brand-primary shadow-md scale-105" 
                      : "bg-brand-bg border-brand-border hover:border-brand-primary/50"
                  )}
                >
                  <div className="relative">
                    <img 
                      src={p.photoUrl} 
                      className="w-16 h-16 rounded-2xl object-cover shadow-sm" 
                      alt={p.name} 
                      referrerPolicy="no-referrer"
                    />
                    {formData.professionalId === p.id && (
                      <div className="absolute -top-1 -right-1 bg-brand-primary text-white p-1 rounded-full border-2 border-white">
                        <CheckCircle2 size={12} />
                      </div>
                    )}
                  </div>
                  <div className="text-center">
                    <p className="text-xs font-bold text-brand-text-dark leading-tight">{p.name}</p>
                    <p className="text-[8px] text-brand-text-muted uppercase font-bold tracking-widest mt-1">Especialista</p>
                  </div>
                </button>
              ))}
              {filteredProfessionals.length === 0 && formData.serviceId && (
                <div className="col-span-full p-4 bg-brand-secondary/30 rounded-xl text-center text-xs text-brand-text-muted italic">
                  Nenhum profissional disponível para este serviço no momento.
                </div>
              )}
            </div>
            {!formData.serviceId && (
              <p className="text-[10px] text-brand-text-muted text-center pt-2">Selecione um serviço primeiro para ver os especialistas disponíveis.</p>
            )}
          </div>
        </div>
        
        <div className="space-y-3">
          <label className="text-[10px] uppercase tracking-[2px] font-extrabold text-brand-text-muted">Data</label>
          <input 
            required
            type="date"
            min={format(new Date(), 'yyyy-MM-dd')}
            className="w-full bg-brand-bg border-brand-border rounded-xl px-4 py-4 outline-none border text-sm font-medium"
            value={formData.date}
            onChange={e => {
              setFormData({ ...formData, date: e.target.value, time: '' });
            }}
          />
        </div>

        <div className="space-y-4">
          <label className="text-[10px] uppercase tracking-[2px] font-extrabold text-brand-text-muted">Horários Disponíveis</label>
          {!formData.professionalId ? (
            <div className="p-4 bg-brand-secondary/30 rounded-xl text-center text-xs text-brand-text-muted">Selecione um profissional para ver os horários</div>
          ) : availableSlots.length > 0 ? (
            <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">
              {availableSlots.map(t => (
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
          ) : (
             <div className="p-4 bg-red-50 text-red-500 rounded-xl text-center text-xs border border-red-100 italic">Sem horários disponíveis para este dia.</div>
          )}
        </div>

        <button 
          type="submit"
          disabled={!formData.time}
          className="w-full bg-brand-primary text-white py-5 rounded-2xl font-bold text-xs tracking-[4px] uppercase hover:scale-[1.01] active:scale-[0.99] transition-all mt-6 shadow-2xl shadow-brand-primary/30 disabled:opacity-50 disabled:grayscale disabled:cursor-not-allowed"
        >
          Confirmar Reserva
        </button>
      </form>
    </motion.div>
  );
}

function AdminView({ 
  appointments, 
  blockedSlots,
  services,
  professionals,
  config,
  salonInfo,
  onUpdateAppointmentStatus,
  onAddService,
  onDeleteService
}: { 
  appointments: Appointment[],
  blockedSlots: BlockedSlot[],
  services: Service[],
  professionals: Professional[],
  config: AppConfig,
  salonInfo: SalonInfo,
  onUpdateAppointmentStatus: (id: string, s: Appointment['status']) => void,
  onAddService: (s: any) => void,
  onDeleteService: (id: string) => void
}) {
  const [activeSection, setActiveSection] = useState<'calendar' | 'services' | 'professionals' | 'settings' | 'stats'>('calendar');
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
        <div className="flex bg-white p-1 rounded-2xl border border-brand-border shadow-sm overflow-x-auto no-scrollbar">
          {[
            { id: 'calendar', label: 'Agenda', icon: <Calendar size={14} /> },
            { id: 'services', label: 'Serviços', icon: <Scissors size={14} /> },
            { id: 'professionals', label: 'Equipe', icon: <Users size={14} /> },
            { id: 'settings', label: 'Horários/Contato', icon: <Clock size={14} /> },
            { id: 'stats', label: 'Dashboard', icon: <Sparkles size={14} /> }
          ].map(tab => (
            <button 
              key={tab.id}
              onClick={() => setActiveSection(tab.id as any)}
              className={cn(
                "px-5 py-2.5 rounded-xl text-[10px] font-extrabold uppercase tracking-widest transition-all flex items-center gap-2 whitespace-nowrap",
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
              blockedSlots={blockedSlots}
              services={services} 
              professionals={professionals}
              config={config}
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
        {activeSection === 'professionals' && (
          <motion.div key="pro" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}>
            <ProfessionalManager professionals={professionals} services={services} />
          </motion.div>
        )}
        {activeSection === 'settings' && (
          <motion.div key="set" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}>
            <AvailabilityManager config={config} salonInfo={salonInfo} />
          </motion.div>
        )}
        {activeSection === 'stats' && (
          <motion.div key="sta" initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.98 }}>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              <DashboardStat title="Receita Hoje" value={`R$ ${totalRevenue}`} subtitle="Total processado" icon={<Sparkles className="text-brand-primary" />} />
              <DashboardStat title="Agendamentos" value={todayAppts.length.toString()} subtitle="Para hoje" icon={<Users className="text-blue-500" />} />
              <DashboardStat title="Capacidade" value={`${Math.min(100, (todayAppts.length * (10 / (professionals.length || 1))))}%`} subtitle="Ocupação da agenda" icon={<Clock className="text-amber-500" />} />
              <DashboardStat title="Cancelamentos" value={appointments.filter(a => a.status === 'cancelled').length.toString()} subtitle="Histórico total" icon={<X className="text-brand-accent" />} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function ProfessionalManager({ professionals, services }: { professionals: Professional[], services: Service[] }) {
  const [name, setName] = useState('');
  const [photoUrl, setPhotoUrl] = useState('');
  const [selectedServiceIds, setSelectedServiceIds] = useState<string[]>([]);

  const toggleService = (id: string) => {
    setSelectedServiceIds(prev => 
      prev.includes(id) ? prev.filter(sid => sid !== id) : [...prev, id]
    );
  };

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !photoUrl || selectedServiceIds.length === 0) return;
    try {
      await addDoc(collection(db, 'professionals'), { 
        name, 
        photoUrl, 
        serviceIds: selectedServiceIds 
      });
      setName(''); setPhotoUrl(''); setSelectedServiceIds([]);
    } catch (error) {
      console.error(error);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'professionals', id));
    } catch (error) {
      console.error(error);
    }
  };

  return (
    <div className="space-y-8">
      <div className="bg-white p-8 rounded-3xl border border-brand-border shadow-sm">
        <h3 className="text-xl font-bold text-brand-text-dark mb-6 flex items-center gap-2">
          <Plus size={20} className="text-brand-primary" />
          Adicionar Novo Profissional
        </h3>
        <form onSubmit={handleAdd} className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Input label="Nome do Profissional" value={name} onChange={setName} placeholder="Ex: Ana Silva" />
          <Input label="URL da Foto" value={photoUrl} onChange={setPhotoUrl} placeholder="URL da foto (Unsplash, etc)" />
          <div className="md:col-span-2 space-y-3">
            <label className="text-[9px] uppercase tracking-[2px] font-extrabold text-brand-text-muted block">Serviços que Realiza</label>
            <div className="flex flex-wrap gap-2">
              {services.map(s => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => toggleService(s.id)}
                  className={cn(
                    "px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase transition-all border",
                    selectedServiceIds.includes(s.id) ? "bg-brand-primary text-white border-brand-primary" : "bg-brand-bg text-brand-text-muted border-brand-border"
                  )}
                >
                  {s.name}
                </button>
              ))}
            </div>
          </div>
          <div className="md:col-span-2">
            <button type="submit" className="w-full bg-brand-primary text-white py-4 rounded-xl font-bold hover:scale-[1.01] transition-all">
              Salvar Profissional
            </button>
          </div>
        </form>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {professionals.map(pro => (
          <div key={pro.id} className="bg-white p-6 rounded-3xl border border-brand-border shadow-sm flex items-center gap-4 relative group">
            <img src={pro.photoUrl} alt={pro.name} className="w-16 h-16 rounded-2xl object-cover" />
            <div>
              <h4 className="font-bold text-brand-text-dark">{pro.name}</h4>
              <div className="flex flex-wrap gap-1 mt-1">
                {pro.serviceIds?.map(sid => {
                  const s = services.find(sv => sv.id === sid);
                  return s ? <span key={sid} className="text-[8px] bg-brand-secondary px-1.5 py-0.5 rounded text-brand-primary font-bold uppercase">{s.name}</span> : null;
                })}
              </div>
            </div>
            <button 
              onClick={() => handleDelete(pro.id)}
              className="absolute top-4 right-4 p-2 text-red-400 hover:text-red-600 opacity-0 group-hover:opacity-100 transition-opacity"
            >
              <Trash2 size={16} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

function AvailabilityManager({ config, salonInfo }: { config: AppConfig, salonInfo: SalonInfo }) {
  const [info, setInfo] = useState(salonInfo);
  const days = [
    { id: 0, label: 'Dom' },
    { id: 1, label: 'Seg' },
    { id: 2, label: 'Ter' },
    { id: 3, label: 'Qua' },
    { id: 4, label: 'Qui' },
    { id: 5, label: 'Sex' },
    { id: 6, label: 'Sáb' }
  ];

  const handleUpdateInfo = async (e: React.FormEvent) => {
    e.preventDefault();
    await setDoc(doc(db, 'settings', 'info'), info);
  };

  const handleToggleDay = async (dayId: number) => {
    const isAvailable = config.availableDays.includes(dayId);
    const newDays = isAvailable 
      ? config.availableDays.filter(d => d !== dayId)
      : [...config.availableDays, dayId].sort();
    
    await setDoc(doc(db, 'settings', 'availability'), { ...config, availableDays: newDays }, { merge: true });
  };

  const [newTime, setNewTime] = useState('');
  const handleAddTime = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTime || config.availableHours.includes(newTime)) return;
    const newHours = [...config.availableHours, newTime].sort();
    await setDoc(doc(db, 'settings', 'availability'), { ...config, availableHours: newHours }, { merge: true });
    setNewTime('');
  };

  const handleRemoveTime = async (time: string) => {
    const newHours = config.availableHours.filter(t => t !== time);
    await setDoc(doc(db, 'settings', 'availability'), { ...config, availableHours: newHours }, { merge: true });
  };

  return (
    <div className="space-y-8">
      <div className="bg-white p-8 rounded-3xl border border-brand-border shadow-sm">
        <h3 className="text-xl font-bold text-brand-text-dark mb-6 flex items-center gap-2">
          <MapPin size={20} className="text-brand-primary" />
          Informações do Rodapé
        </h3>
        <form onSubmit={handleUpdateInfo} className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Input label="Endereço Completo" value={info.address} onChange={v => setInfo({...info, address: v})} placeholder="Ex: Rua das Flores, 123..." />
          <Input label="Telefone / WhatsApp" value={info.phone} onChange={v => setInfo({...info, phone: v})} placeholder="Ex: (11) 98765-4321" />
          <Input label="Instagram" value={info.instagram} onChange={v => setInfo({...info, instagram: v})} placeholder="Ex: @agenda_facil" />
          <div className="md:col-span-3">
             <button type="submit" className="w-full bg-stone-900 text-white py-3 rounded-xl text-xs font-bold uppercase tracking-widest hover:bg-black transition-all">Atualizar Contatos</button>
          </div>
        </form>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <div className="bg-white p-8 rounded-3xl border border-brand-border shadow-sm">
          <h3 className="text-xl font-bold text-brand-text-dark mb-6 flex items-center gap-2">
            <Calendar size={20} className="text-brand-primary" />
            Dias de Atendimento
          </h3>
          <div className="flex flex-wrap gap-3">
            {days.map(day => (
              <button 
                key={day.id}
                onClick={() => handleToggleDay(day.id)}
                className={cn(
                  "px-5 py-3 rounded-xl font-bold transition-all border",
                  config.availableDays.includes(day.id)
                    ? "bg-brand-primary text-white border-brand-primary"
                    : "bg-brand-bg text-brand-text-muted border-brand-border"
                )}
              >
                {day.label}
              </button>
            ))}
          </div>
        </div>

        <div className="bg-white p-8 rounded-3xl border border-brand-border shadow-sm">
          <h3 className="text-xl font-bold text-brand-text-dark mb-6 flex items-center gap-2">
            <Clock size={20} className="text-brand-primary" />
            Grade de Horários
          </h3>
          <form onSubmit={handleAddTime} className="flex gap-2 mb-6">
            <input 
              type="time" 
              value={newTime} 
              onChange={e => setNewTime(e.target.value)}
              className="flex-1 bg-brand-bg border border-brand-border rounded-xl px-4 py-2 outline-none"
            />
            <button type="submit" className="p-3 bg-brand-primary text-white rounded-xl font-bold">
              <Plus size={20} />
            </button>
          </form>
          <div className="grid grid-cols-3 md:grid-cols-4 gap-2">
            {config.availableHours.map(time => (
              <div key={time} className="bg-brand-bg p-2 rounded-lg border border-brand-border flex items-center justify-between">
                <span className="text-xs font-bold text-brand-text-dark">{time}</span>
                <button onClick={() => handleRemoveTime(time)} className="text-red-400 hover:text-red-600">
                  <X size={14} />
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function CalendarSection({ 
  appointments, 
  blockedSlots,
  services, 
  professionals,
  config,
  onUpdateStatus,
  currentDate,
  setCurrentDate
}: { 
  appointments: Appointment[], 
  blockedSlots: BlockedSlot[],
  services: Service[], 
  professionals: Professional[],
  config: AppConfig,
  onUpdateStatus: (id: string, s: any) => void,
  currentDate: Date,
  setCurrentDate: (d: Date) => void
}) {
  const dateStr = format(currentDate, 'yyyy-MM-dd');
  const dayAppts = appointments.filter(a => a.date === dateStr).sort((a,b) => a.time.localeCompare(b.time));

  const weekStart = startOfWeek(currentDate, { weekStartsOn: 0 });
  const weekDays = [...Array(7)].map((_, i) => addDays(weekStart, i));

  const toggleBlockSlot = async (proId: string, time: string) => {
    const existing = blockedSlots.find(bs => bs.date === dateStr && bs.time === time && bs.professionalId === proId);
    if (existing) {
      await deleteDoc(doc(db, 'blocked_slots', existing.id));
    } else {
      await addDoc(collection(db, 'blocked_slots'), {
        date: dateStr,
        time,
        professionalId: proId
      });
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
      <div className="lg:col-span-1 space-y-6">
        <div className="bg-white p-6 rounded-2xl border border-brand-border shadow-sm">
          {/* Calendar picker */}
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
          <div className="grid grid-cols-7 gap-1 text-[10px]">
            {weekDays.map(day => (
              <button 
                key={day.toISOString()}
                onClick={() => setCurrentDate(day)}
                className={cn(
                  "aspect-square flex flex-col items-center justify-center rounded-lg font-bold transition-all relative",
                  isSameDay(day, currentDate) ? "bg-brand-primary text-white shadow-lg shadow-brand-primary/20 scale-110" : "hover:bg-brand-bg text-brand-text-dark",
                  isSameDay(day, new Date()) && !isSameDay(day, currentDate) && "text-brand-primary underline"
                )}
              >
                {format(day, 'd')}
                {(appointments.some(a => a.date === format(day, 'yyyy-MM-dd')) || blockedSlots.some(b => b.date === format(day, 'yyyy-MM-dd'))) && !isSameDay(day, currentDate) && (
                  <div className="absolute bottom-1 w-1 h-1 bg-brand-primary rounded-full" />
                )}
              </button>
            ))}
          </div>
        </div>
        
        <div className="bg-white p-6 rounded-2xl border border-brand-border shadow-sm">
          <h4 className="text-[10px] font-extrabold uppercase tracking-[2px] mb-4 text-brand-text-muted">Gestão de Horários</h4>
          <p className="text-[10px] text-brand-text-muted mb-4 italic leading-relaxed">
            Clique nos horários à direita para bloquear/desbloquear. Horários bloqueados não aparecerão para clientes.
          </p>
          <div className="space-y-3">
            <div className="flex items-center gap-3 text-xs font-medium"><div className="w-2 h-2 rounded-full bg-blue-500" /> Agendado</div>
            <div className="flex items-center gap-3 text-xs font-medium"><div className="w-2 h-2 rounded-full bg-emerald-500" /> Concluído</div>
            <div className="flex items-center gap-3 text-xs font-medium"><div className="w-3 h-3 border border-brand-primary rounded-sm flex items-center justify-center"><Clock size={8} /></div> Bloqueado Manual</div>
          </div>
        </div>
      </div>

      <div className="lg:col-span-3 space-y-8">
        <div className="flex justify-between items-center bg-white p-6 rounded-2xl border border-brand-border shadow-sm">
           <div>
             <h3 className="font-bold text-xl tracking-tight">Grade de Atendimento</h3>
             <p className="text-xs text-brand-text-muted mt-1">{format(currentDate, "EEEE, dd 'de' MMMM", { locale: ptBR })}</p>
           </div>
           <div className="text-[10px] font-extrabold uppercase tracking-widest bg-brand-bg px-4 py-2 rounded-xl border border-brand-border">
             {dayAppts.length} Agendamentos App
           </div>
        </div>

        {/* View grid by professional */}
        <div className="space-y-8">
          {professionals.map(pro => {
            const proAppts = dayAppts.filter(a => a.professionalId === pro.id);
            return (
              <div key={pro.id} className="bg-white rounded-3xl border border-brand-border shadow-sm overflow-hidden">
                <div className="bg-brand-bg/50 p-4 border-b border-brand-border flex items-center gap-4">
                  <img src={pro.photoUrl} className="w-10 h-10 rounded-xl object-cover" alt={pro.name} />
                  <div>
                    <h4 className="font-bold text-brand-text-dark text-sm">{pro.name}</h4>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {pro.serviceIds?.map(sid => {
                        const s = services.find(sv => sv.id === sid);
                        return s ? <span key={sid} className="text-[8px] bg-brand-secondary px-1.5 py-0.5 rounded text-brand-primary font-bold uppercase">{s.name}</span> : null;
                      })}
                    </div>
                  </div>
                </div>
                <div className="p-4 grid grid-cols-2 md:grid-cols-5 gap-3">
                  {config.availableHours.map(time => {
                    const appt = proAppts.find(a => a.time === time);
                    const isBlocked = blockedSlots.some(bs => bs.date === dateStr && bs.time === time && bs.professionalId === pro.id);
                    
                    return (
                      <div 
                        key={`${pro.id}-${time}`}
                        className={cn(
                          "p-3 rounded-xl border text-[10px] font-extrabold uppercase tracking-tight transition-all relative flex flex-col items-center justify-center gap-1 min-h-[60px]",
                          appt ? (
                            appt.status === 'completed' ? "bg-emerald-50 border-emerald-200 text-emerald-700" :
                            appt.status === 'cancelled' ? "bg-red-50 border-red-200 text-red-700" :
                            "bg-blue-50 border-blue-200 text-blue-700 shadow-sm"
                          ) : isBlocked ? (
                            "bg-brand-primary text-white border-brand-primary shadow-lg shadow-brand-primary/20 cursor-pointer"
                          ) : (
                            "bg-white border-brand-border text-stone-500 hover:border-brand-primary/30 cursor-pointer"
                          )
                        )}
                        onClick={() => !appt && toggleBlockSlot(pro.id, time)}
                      >
                        <span className={cn("text-xs", isBlocked ? "text-white" : "text-brand-text-dark")}>{time}</span>
                        {appt ? (
                          <span className="opacity-70 truncate max-w-full">{appt.customerName}</span>
                        ) : isBlocked ? (
                          <span className="flex items-center gap-1"><Clock size={10} /> BLOQUEADO</span>
                        ) : (
                          <span className="opacity-0 group-hover:opacity-100">Disponível</span>
                        )}
                        
                        {appt && appt.status === 'scheduled' && (
                          <div className="absolute -top-2 -right-2 flex gap-1 z-10">
                            <button 
                              onClick={(e) => { e.stopPropagation(); onUpdateStatus(appt.id, 'completed'); }}
                              className="w-7 h-7 bg-white shadow-xl border border-emerald-200 rounded-full flex items-center justify-center text-emerald-500 hover:scale-110 transition-transform"
                              title="Concluir"
                            >
                              <CheckCircle2 size={14} />
                            </button>
                            <button 
                              onClick={(e) => { e.stopPropagation(); onUpdateStatus(appt.id, 'cancelled'); }}
                              className="w-7 h-7 bg-white shadow-xl border border-red-200 rounded-full flex items-center justify-center text-red-500 hover:scale-110 transition-transform"
                              title="Cancelar"
                            >
                              <X size={14} />
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
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

function LandingPage({ onEnter, salonInfo, services }: { onEnter: () => void, salonInfo: SalonInfo, services: Service[] }) {
  const testimonials = [
    { name: "Mariana Silva", comment: "O melhor atendimento que já tive! A facilidade de agendar pelo site mudou minha rotina.", rating: 5, avatar: "https://i.pravatar.cc/150?u=mariana" },
    { name: "Ricardo Oliveira", comment: "Ambiente impecável e profissionais excelentes. Recomendo o corte degradê!", rating: 5, avatar: "https://i.pravatar.cc/150?u=ricardo" },
    { name: "Ana Beatriz", comment: "Fiz as unhas e amei o resultado. O sistema de agendamento é muito intuitivo.", rating: 5, avatar: "https://i.pravatar.cc/150?u=ana" }
  ];

  return (
    <div className="min-h-screen bg-white">
      {/* Hero Section */}
      <header className="relative h-[80vh] overflow-hidden">
        <div className="absolute inset-0">
          <img 
            src="https://images.unsplash.com/photo-1560066984-138dadb4c035?auto=format&fit=crop&q=80&w=1920" 
            className="w-full h-full object-cover" 
            alt="Salon Hero"
            referrerPolicy="no-referrer"
          />
          <div className="absolute inset-0 bg-black/50" />
        </div>
        
        <div className="relative h-full max-w-7xl mx-auto px-4 flex flex-col items-center justify-center text-center">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
            className="space-y-6"
          >
            <div className="inline-flex items-center gap-2 bg-brand-primary/20 backdrop-blur-md px-4 py-2 rounded-full text-white text-xs font-bold uppercase tracking-widest border border-white/20">
              <Sparkles size={14} className="text-brand-secondary" />
              Sua beleza em primeiro lugar
            </div>
            <h1 className="text-5xl md:text-7xl font-bold text-white tracking-tighter max-w-4xl">
              Transforme seu Estilo no <span className="text-brand-secondary">Agenda Fácil</span>
            </h1>
            <p className="text-lg md:text-xl text-white/80 max-w-2xl mx-auto font-medium">
              Agende seus serviços favoritos com os melhores profissionais da região em poucos cliques.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center pt-8">
              <button 
                onClick={onEnter}
                className="bg-brand-primary text-white px-10 py-5 rounded-2xl text-sm font-bold uppercase tracking-[2px] transition-all hover:scale-105 shadow-xl shadow-brand-primary/30"
              >
                Agendar Agora
              </button>
              <button className="bg-white/10 backdrop-blur-md text-white border border-white/20 px-10 py-5 rounded-2xl text-sm font-bold uppercase tracking-[2px] transition-all hover:bg-white hover:text-brand-text-dark">
                Ver Serviços
              </button>
            </div>
          </motion.div>
        </div>
      </header>

      {/* Gallery/Features Section */}
      <section className="py-24 bg-brand-bg">
        <div className="max-w-7xl mx-auto px-4">
          <div className="text-center mb-16 space-y-4">
            <h2 className="text-3xl md:text-4xl font-bold text-brand-text-dark tracking-tight">Nossos Serviços</h2>
            <div className="w-20 h-1 bg-brand-primary mx-auto rounded-full" />
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {services.slice(0, 6).map((s, i) => (
              <motion.div 
                key={s.id}
                initial={{ opacity: 0, scale: 0.9 }}
                whileInView={{ opacity: 1, scale: 1 }}
                transition={{ delay: i * 0.1 }}
                className="group relative h-80 rounded-3xl overflow-hidden shadow-lg"
              >
                <img 
                  src={s.photoUrl || `https://picsum.photos/seed/${s.name}/600/800`} 
                  className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110" 
                  alt={s.name}
                  referrerPolicy="no-referrer"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
                <div className="absolute bottom-0 left-0 p-6 text-white">
                  <h4 className="text-xl font-bold mb-1">{s.name}</h4>
                  <p className="text-brand-secondary text-sm font-bold">{s.price}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Experience Section */}
      <section className="py-24 overflow-hidden">
        <div className="max-w-7xl mx-auto px-4 grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
          <div className="space-y-8">
            <h2 className="text-4xl md:text-5xl font-bold text-brand-text-dark tracking-tighter leading-tight">
              Uma experência completa de <br />
              <span className="text-brand-primary">Autocuidado e Bem-estar</span>
            </h2>
            <p className="text-lg text-brand-text-muted leading-relaxed">
              No Agenda Fácil, unimos técnica, tendências e um atendimento personalizado para garantir que você saia com a melhor versão de si mesmo. Nossos profissionais são especialistas em transformar desejos em realidade.
            </p>
            <div className="grid grid-cols-2 gap-8 pt-4">
              <div className="space-y-2">
                <div className="text-3xl font-bold text-brand-primary">100%</div>
                <p className="text-xs font-bold uppercase tracking-wider text-brand-text-muted">Satisfação</p>
              </div>
              <div className="space-y-2">
                <div className="text-3xl font-bold text-brand-primary">+2k</div>
                <p className="text-xs font-bold uppercase tracking-wider text-brand-text-muted">Clientes Felizes</p>
              </div>
            </div>
          </div>
          <div className="relative">
            <div className="grid grid-cols-2 gap-4">
              <img 
                src="https://images.unsplash.com/photo-1522335789203-aabd1fc54bc9?auto=format&fit=crop&q=80&w=400" 
                className="rounded-2xl shadow-xl mt-12" 
                alt="Salon Detail 1"
                referrerPolicy="no-referrer"
              />
              <img 
                src="https://images.unsplash.com/photo-1633681926022-84c23e8cb2d6?auto=format&fit=crop&q=80&w=400" 
                className="rounded-2xl shadow-xl" 
                alt="Salon Detail 2"
                referrerPolicy="no-referrer"
              />
            </div>
          </div>
        </div>
      </section>

      {/* Testimonials Section */}
      <section className="py-24 bg-brand-bg">
        <div className="max-w-7xl mx-auto px-4">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold text-brand-text-dark tracking-tight">O que nossos clientes dizem</h2>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {testimonials.map((t, i) => (
              <motion.div 
                key={i}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                className="bg-white p-8 rounded-3xl shadow-sm border border-brand-border space-y-6"
              >
                <div className="flex gap-1 text-yellow-400">
                  {[...Array(t.rating)].map((_, j) => <Sparkles size={16} key={j} />)}
                </div>
                <p className="text-brand-text-dark font-medium italic">"{t.comment}"</p>
                <div className="flex items-center gap-4 pt-4">
                  <img src={t.avatar} className="w-12 h-12 rounded-full border-2 border-brand-secondary" alt={t.name} />
                  <div>
                    <h5 className="font-bold text-brand-text-dark text-sm">{t.name}</h5>
                    <p className="text-[10px] text-brand-text-muted uppercase font-bold tracking-widest">Cliente Verificado</p>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Call to Action */}
      <section className="py-24 bg-brand-primary relative overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-white/10 to-transparent opacity-50" />
        <div className="relative max-w-4xl mx-auto px-4 text-center space-y-8">
          <h2 className="text-4xl md:text-5xl font-bold text-white tracking-tighter">Pronto para realçar sua beleza?</h2>
          <p className="text-white/80 text-lg">Nosso time está esperando por você. Reserve seu horário agora mesmo.</p>
          <button 
            onClick={onEnter}
            className="bg-white text-brand-primary px-12 py-6 rounded-2xl text-sm font-extrabold uppercase tracking-[4px] hover:scale-105 transition-all shadow-2xl shadow-black/20"
          >
            Acessar Plataforma
          </button>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-12 bg-white border-t border-brand-border text-center">
        <div className="max-w-7xl mx-auto px-4 space-y-6">
          <div className="flex items-center justify-center gap-2 text-brand-primary font-bold text-xl tracking-tighter">
            <Scissors size={24} /> Agenda Fácil
          </div>
          <p className="text-brand-text-muted text-sm max-w-md mx-auto">
            {salonInfo.address} • {salonInfo.phone}
          </p>
          <div className="flex justify-center gap-4 text-brand-text-muted">
             <a href={`https://instagram.com/${salonInfo.instagram.replace('@','')}`} target="_blank" className="hover:text-brand-primary"><Instagram size={20} /></a>
          </div>
          <div className="pt-8 text-[10px] text-brand-text-muted uppercase font-bold tracking-widest opacity-50">
            &copy; 2026 Agenda Fácil. Todos os direitos reservados.
          </div>
        </div>
      </footer>
    </div>
  );
}
