export default function AuthLayout({ children }: { children: React.ReactNode }) 
{ return ( <div className="min-h-screen flex items-center justify-center bg-[#F1F3EF] px-4"> 
<div className="w-full max-w-sm"> <p className="text-2xl font-semibold text-[#1E2B3A] mb-8 text-center">Shiva Sons</p> {children} </div> 
</div> ) } 