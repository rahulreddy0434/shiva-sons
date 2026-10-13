export default function AuthLayout({ children }: { children: React.ReactNode }) 
{ return ( <div className="min-h-screen flex items-center justify-center bg-surface px-4"> 
<div className="w-full max-w-sm"> <p className="text-2xl font-semibold text-ink mb-8 text-center">Shiva Sons</p> {children} </div> 
</div> ) } 