function GlassCard({ children, className = "", hover = false }) {
    return (
        <div className={`
            ${hover ? 'glass-card' : 'glass-panel rounded-xl'} 
            ${className}
        `}>
            {children}
        </div>
    );
}

export default GlassCard;