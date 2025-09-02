import { useEffect, useMemo, useState } from 'react';
import type { Project } from '../lib/supabase';
import { useDatabaseStore } from '../stores/database';

declare global {
	namespace JSX {
		interface IntrinsicElements {
			'model-viewer': any;
		}
	}
}

interface ARViewerProps {
  onBack?: () => void;
  user?: any;
	project?: Project | null;
}

export default function ARViewer({ onBack, user, project }: ARViewerProps) {
	const [activeModelUrl, setActiveModelUrl] = useState<string>(() => (
		(project as any)?.optimized_model_url || (project as any)?.model_url || '/Octa2.glb'
	));
	const [activeUsdzUrl, setActiveUsdzUrl] = useState<string | undefined>(() => (
		(project as any)?.optimized_usdz_url || undefined
	));

	const [showExplorer, setShowExplorer] = useState(false);
	const [searchTerm, setSearchTerm] = useState('');
	const [userProjects, setUserProjects] = useState<any[]>([]);
	const [publicProjects, setPublicProjects] = useState<any[]>([]);
	const [loadingProjects, setLoadingProjects] = useState(false);
	const [hasLoadedProjects, setHasLoadedProjects] = useState(false);
	const [projectsError, setProjectsError] = useState<string | null>(null);
	const { loadProjectsForAR } = useDatabaseStore();

  useEffect(() => {
		if (typeof window === 'undefined') return;
		if (customElements.get('model-viewer')) return;
		const script = document.createElement('script');
		script.type = 'module';
		script.src = 'https://unpkg.com/@google/model-viewer@4/dist/model-viewer.min.js';
		document.head.appendChild(script);
  }, []);

	useEffect(() => {
		if (!showExplorer || loadingProjects || hasLoadedProjects) return;
		setLoadingProjects(true);
		(async () => {
			try {
				const result = await loadProjectsForAR(user?.id || 'anonymous');
				setUserProjects(result.userProjects || []);
				setPublicProjects(result.publicProjects || []);
				setProjectsError(null);
				setHasLoadedProjects(true);
			} catch (e) {
				setProjectsError('Failed to load projects');
    } finally {
				setLoadingProjects(false);
			}
		})();
	}, [showExplorer, loadingProjects, hasLoadedProjects, loadProjectsForAR, user?.id]);
  
  useEffect(() => {
		if (!showExplorer || !loadingProjects) return;
		const timeoutId = window.setTimeout(() => {
			setLoadingProjects(false);
			setProjectsError(prev => prev || 'Taking longer than expected...');
		}, 12000);
		return () => window.clearTimeout(timeoutId);
	}, [showExplorer, loadingProjects]);

	const filteredUser = useMemo(() => {
		const q = searchTerm.trim().toLowerCase();
		if (!q) return userProjects;
		return userProjects.filter((p: any) =>
			(p.name || '').toLowerCase().includes(q) ||
			(p.description || '').toLowerCase().includes(q)
		);
	}, [userProjects, searchTerm]);

	const filteredPublic = useMemo(() => {
		const q = searchTerm.trim().toLowerCase();
		if (!q) return publicProjects;
		return publicProjects.filter((p: any) =>
			(p.name || '').toLowerCase().includes(q) ||
			(p.description || '').toLowerCase().includes(q)
		);
	}, [publicProjects, searchTerm]);

	const handleSelectProject = (p: any) => {
		const url = p?.optimized_model_url || p?.model_url;
		if (!url) return;
		setActiveModelUrl(url);
		setActiveUsdzUrl(p?.optimized_usdz_url || undefined);
		setShowExplorer(false);
  };

  return (
		<div className="fixed inset-0 w-screen h-screen" style={{ background: 'transparent' }}>
			<header className="fixed top-0 left-0 right-0 w-full h-20 px-8 header-glass z-50">
        <div className="flex items-center justify-between h-full" style={{ paddingLeft: '1rem', paddingRight: '1rem' }}>
          <div className="w-24 flex items-center">
            {onBack && (
							<button onClick={onBack} className="btn-secondary rounded-lg">
                <span className="text-sm font-medium">Back</span>
              </button>
            )}
          </div>
					<div className="flex-1 flex items-center justify-center gap-3">
						<img src="/general_header.svg" alt="Climate Refuge AR" className="h-10 md:h-12 w-auto" style={{ maxHeight: '70px', padding: '0.2rem' }} />
            </div>
					<div className="w-24 flex items-center justify-end">
						<button onClick={() => setShowExplorer(true)} className="btn-primary rounded-lg">
							<span className="text-sm font-medium">Open</span>
            </button>
          </div>
        </div>
      </header>

			<div className="absolute inset-0 pt-16">
				<model-viewer
					style={{ width: '100vw', height: '100vh', background: 'transparent' }}
					src={activeModelUrl}
					ar
					ar-modes="scene-viewer quick-look webxr"
					ios-src={activeUsdzUrl as any}
					camera-controls
					auto-rotate
					autoplay
					exposure="0.9"
					shadow-intensity="0.2"
					environment-image="/goegap_4k.hdr"
					skybox-image="/goegap_4k.hdr"
					ar-placement="floor"
					ar-scale="fixed"
				>
                <button 
						slot="ar-button"
						className="rounded-lg px-4 py-2 bg-black/70 text-white border border-white/10 hover:bg-black/80"
						style={{ position: 'fixed', bottom: '72px', left: '50%', transform: 'translateX(-50%)', zIndex: 60, borderRadius: '10px', padding: '0.5rem 1rem', background: '#000000', color: '#ffffff', border: '1px solid rgba(71, 71, 71, 0.5)', boxShadow: '0 8px 24px rgba(50, 50, 50, 0.35)' }}
                >
						View in AR
                </button>
				</model-viewer>
      </div>

			{showExplorer && (
				<>
					<div className="fixed inset-0 z-40 viewer-glass backdrop-blur-xl bg-black/30" onClick={() => setShowExplorer(false)} />
					<div className="fixed top-0 right-0 h-full w-full z-50">
						<div className="h-full glass-panel border-l border-white/10 shadow-2xl flex flex-col">
							<div className="p-4 border-white/10 flex items-center gap-2">
                  <input
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="Search projects..."
                    className="flex-1 bg-transparent text-white placeholder-white/50 outline-none glass-chip px-3 py-2 rounded-lg"
                  />
								<button className="btn-ghost rounded-lg" style={{ borderRadius: '10px', padding: '1rem', background: '#000000', color: '#ffffff', border: '1px solid rgba(71, 71, 71, 0.5)', boxShadow: '0 8px 24px rgba(50, 50, 50, 0.35)', borderTopRightRadius: '0px', borderBottomRightRadius: '0px' }} onClick={() => setShowExplorer(false)}>✕</button>
                </div>
							<div className="p-4 overflow-y-auto flex-1 space-y-6">
								{loadingProjects ? (
									<div className="text-center text-white/80">Loading projects...</div>
								) : projectsError ? (
									<div className="text-center text-white/70">{projectsError}</div>
								) : (
									<>
										{user && (
                      <div>
												<div className="mb-2 text-white/70 text-sm" style={{ marginTop: '1rem', textAlign: 'center' }}>My Projects</div>
												<div className="space-y-2">
													{filteredUser.map((p: any) => (
														<button key={p.id} onClick={() => handleSelectProject(p)} className="w-full text-left glass-card p-3 rounded-lg hover:border-white/30 transition">
															<div className="text-white font-medium">{p.name}</div>
															<div className="text-white/60 text-xs mt-1 truncate">{p.description}</div>
														</button>
													))}
													{filteredUser.length === 0 && (
														<div className="glass-card text-white/70 text-sm p-3 rounded-lg">No matching projects</div>
													)}
                         </div>
                       </div>
                     )}
                      <div>
											<div className="mb-2 text-white/70 text-sm" style={{ marginTop: '1rem', textAlign: 'center' }}>Public Projects</div>
											<div className="space-y-2">
												{filteredPublic.map((p: any) => (
													<button key={p.id} onClick={() => handleSelectProject(p)} className="w-full text-left glass-card p-3 rounded-lg hover:border-white/30 transition">
														<div className="text-white font-medium">{p.name}</div>
														<div className="text-white/60 text-xs mt-1 truncate">{p.description}</div>
													</button>
												))}
												{filteredPublic.length === 0 && (
													<div className="glass-card text-white/70 text-sm p-3 rounded-lg">No matching public projects</div>
                    )}
                   </div>
              </div>
          </>
        )}
							</div>
              </div>
            </div>
				</>
        )}
    </div>
  );
}