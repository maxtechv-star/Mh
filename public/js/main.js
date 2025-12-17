// Reflection button functionality
document.addEventListener('DOMContentLoaded', function() {
    // Handle reflection button clicks
    document.querySelectorAll('.reflect-btn').forEach(button => {
        button.addEventListener('click', async function() {
            const messageId = this.getAttribute('data-id');
            const countElement = this.querySelector('.reflect-count');
            const originalText = this.querySelector('.reflect-text')?.textContent;
            
            // Prevent multiple clicks
            if (this.classList.contains('loading')) return;
            
            // Visual feedback
            this.classList.add('loading');
            this.style.opacity = '0.7';
            if (originalText) {
                this.querySelector('.reflect-text').textContent = 'Reflecting...';
            }
            
            try {
                const response = await fetch(`/reflect/${messageId}`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    }
                });
                
                const data = await response.json();
                
                if (data.success) {
                    // Update count
                    if (countElement) {
                        countElement.textContent = data.count;
                    }
                    
                    // Success animation
                    this.classList.add('reflected');
                    this.style.backgroundColor = '#e3f2ff';
                    this.style.borderColor = '#3a86ff';
                    
                    // Restore text after animation
                    setTimeout(() => {
                        if (originalText && this.querySelector('.reflect-text')) {
                            this.querySelector('.reflect-text').textContent = originalText;
                        }
                    }, 1500);
                    
                    // Show success message briefly
                    const successMsg = document.createElement('div');
                    successMsg.className = 'flash-message';
                    successMsg.textContent = 'Reflection added ✓';
                    successMsg.style.cssText = `
                        position: fixed;
                        top: 20px;
                        right: 20px;
                        background: #4caf50;
                        color: white;
                        padding: 10px 20px;
                        border-radius: 4px;
                        z-index: 1000;
                        animation: fadeInOut 2s ease-in-out;
                    `;
                    document.body.appendChild(successMsg);
                    setTimeout(() => successMsg.remove(), 2000);
                    
                } else if (data.message === 'Already reflected') {
                    // Already reflected feedback
                    this.classList.add('already-reflected');
                    this.style.backgroundColor = '#ffecb3';
                    this.style.borderColor = '#ffb300';
                    
                    const infoMsg = document.createElement('div');
                    infoMsg.className = 'flash-message';
                    infoMsg.textContent = 'You already reflected on this message';
                    infoMsg.style.cssText = `
                        position: fixed;
                        top: 20px;
                        right: 20px;
                        background: #ffb300;
                        color: white;
                        padding: 10px 20px;
                        border-radius: 4px;
                        z-index: 1000;
                        animation: fadeInOut 2s ease-in-out;
                    `;
                    document.body.appendChild(infoMsg);
                    setTimeout(() => infoMsg.remove(), 2000);
                }
            } catch (error) {
                console.error('Error:', error);
                
                // Error feedback
                const errorMsg = document.createElement('div');
                errorMsg.className = 'flash-message';
                errorMsg.textContent = 'Failed to add reflection';
                errorMsg.style.cssText = `
                    position: fixed;
                    top: 20px;
                    right: 20px;
                    background: #f44336;
                    color: white;
                    padding: 10px 20px;
                    border-radius: 4px;
                    z-index: 1000;
                    animation: fadeInOut 2s ease-in-out;
                `;
                document.body.appendChild(errorMsg);
                setTimeout(() => errorMsg.remove(), 2000);
            } finally {
                this.classList.remove('loading');
                this.style.opacity = '';
                
                // Restore original text
                setTimeout(() => {
                    if (originalText && this.querySelector('.reflect-text')) {
                        this.querySelector('.reflect-text').textContent = originalText;
                    }
                }, 1000);
            }
        });
    });
    
    // Add CSS for animations
    const style = document.createElement('style');
    style.textContent = `
        @keyframes fadeInOut {
            0% { opacity: 0; transform: translateY(-10px); }
            15% { opacity: 1; transform: translateY(0); }
            85% { opacity: 1; transform: translateY(0); }
            100% { opacity: 0; transform: translateY(-10px); }
        }
        
        .reflect-btn.loading {
            cursor: not-allowed;
        }
        
        .reflect-btn.reflected {
            animation: pulse 0.5s;
        }
        
        .reflect-btn.already-reflected {
            animation: shake 0.5s;
        }
        
        @keyframes pulse {
            0% { transform: scale(1); }
            50% { transform: scale(1.05); }
            100% { transform: scale(1); }
        }
        
        @keyframes shake {
            0%, 100% { transform: translateX(0); }
            25% { transform: translateX(-2px); }
            75% { transform: translateX(2px); }
        }
    `;
    document.head.appendChild(style);
    
    // Auto-hide success/error messages
    setTimeout(() => {
        document.querySelectorAll('.success-message, .error-message').forEach(msg => {
            msg.style.opacity = '0';
            setTimeout(() => msg.style.display = 'none', 300);
        });
    }, 5000);
});