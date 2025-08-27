#!/bin/bash

# Dynamic AI Chatbot Setup Script
# This script automates the setup of the entire project

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Function to check if command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Function to check system requirements
check_requirements() {
    print_status "Checking system requirements..."
    
    # Check Node.js
    if ! command_exists node; then
        print_error "Node.js is not installed. Please install Node.js 16 or higher."
        exit 1
    fi
    
    NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
    if [ "$NODE_VERSION" -lt 16 ]; then
        print_error "Node.js version 16 or higher is required. Current version: $(node -v)"
        exit 1
    fi
    
    print_success "Node.js $(node -v) ✓"
    
    # Check npm
    if ! command_exists npm; then
        print_error "npm is not installed."
        exit 1
    fi
    
    print_success "npm $(npm -v) ✓"
    
    # Check Git
    if ! command_exists git; then
        print_warning "Git is not installed. Some features may not work properly."
    else
        print_success "Git $(git --version) ✓"
    fi
    
    # Check Docker (optional)
    if command_exists docker; then
        print_success "Docker $(docker --version) ✓"
        DOCKER_AVAILABLE=true
    else
        print_warning "Docker is not installed. You can still run the project locally."
        DOCKER_AVAILABLE=false
    fi
    
    # Check Docker Compose (optional)
    if command_exists docker-compose; then
        print_success "Docker Compose $(docker-compose --version) ✓"
        DOCKER_COMPOSE_AVAILABLE=true
    else
        print_warning "Docker Compose is not installed."
        DOCKER_COMPOSE_AVAILABLE=false
    fi
}

# Function to create environment file
create_env_file() {
    print_status "Creating environment configuration file..."
    
    if [ ! -f .env ]; then
        cp env.example .env
        print_success "Environment file created from template"
        print_warning "Please edit .env file with your actual configuration values"
    else
        print_warning ".env file already exists, skipping creation"
    fi
}

# Function to install backend dependencies
install_backend() {
    print_status "Installing backend dependencies..."
    
    if [ ! -d "node_modules" ]; then
        npm install
        print_success "Backend dependencies installed"
    else
        print_warning "Backend dependencies already installed, skipping"
    fi
}

# Function to install frontend dependencies
install_frontend() {
    print_status "Installing frontend dependencies..."
    
    if [ ! -d "client/node_modules" ]; then
        cd client
        npm install
        cd ..
        print_success "Frontend dependencies installed"
    else
        print_warning "Frontend dependencies already installed, skipping"
    fi
}

# Function to create necessary directories
create_directories() {
    print_status "Creating necessary directories..."
    
    mkdir -p logs
    mkdir -p uploads
    mkdir -p client/build
    
    print_success "Directories created"
}

# Function to setup database (MongoDB)
setup_database() {
    print_status "Setting up database..."
    
    if [ "$DOCKER_AVAILABLE" = true ] && [ "$DOCKER_COMPOSE_AVAILABLE" = true ]; then
        print_status "Starting MongoDB with Docker..."
        docker-compose up -d mongodb redis
        
        # Wait for MongoDB to be ready
        print_status "Waiting for MongoDB to be ready..."
        sleep 10
        
        print_success "Database services started"
    else
        print_warning "Docker not available. Please ensure MongoDB and Redis are running manually."
        print_status "You can start them with:"
        echo "  - MongoDB: mongod"
        echo "  - Redis: redis-server"
    fi
}

# Function to build frontend
build_frontend() {
    print_status "Building frontend..."
    
    cd client
    npm run build
    cd ..
    
    print_success "Frontend built successfully"
}

# Function to run tests
run_tests() {
    print_status "Running tests..."
    
    # Backend tests
    if [ -f "package.json" ] && grep -q "test" package.json; then
        print_status "Running backend tests..."
        npm test || print_warning "Backend tests failed"
    fi
    
    # Frontend tests
    if [ -f "client/package.json" ] && grep -q "test" client/package.json; then
        print_status "Running frontend tests..."
        cd client
        npm test -- --watchAll=false || print_warning "Frontend tests failed"
        cd ..
    fi
    
    print_success "Tests completed"
}

# Function to start development servers
start_development() {
    print_status "Starting development servers..."
    
    print_status "Starting backend server..."
    npm run dev &
    BACKEND_PID=$!
    
    print_status "Starting frontend server..."
    cd client
    npm start &
    FRONTEND_PID=$!
    cd ..
    
    print_success "Development servers started"
    print_status "Backend: http://localhost:5000"
    print_status "Frontend: http://localhost:3000"
    print_status "Press Ctrl+C to stop all servers"
    
    # Wait for user to stop servers
    trap "kill $BACKEND_PID $FRONTEND_PID 2>/dev/null; exit" INT
    wait
}

# Function to show usage information
show_usage() {
    echo "Dynamic AI Chatbot Setup Script"
    echo ""
    echo "Usage: $0 [OPTION]"
    echo ""
    echo "Options:"
    echo "  -h, --help          Show this help message"
    echo "  -i, --install       Install dependencies and setup project"
    echo "  -d, --dev           Start development servers"
    echo "  -t, --test          Run tests"
    echo "  -b, --build         Build frontend for production"
    echo "  -c, --clean         Clean up node_modules and build files"
    echo "  -s, --start         Start production servers (requires build)"
    echo ""
    echo "Examples:"
    echo "  $0 --install        # Full installation and setup"
    echo "  $0 --dev            # Start development servers"
    echo "  $0 --test           # Run all tests"
}

# Function to clean up
cleanup() {
    print_status "Cleaning up..."
    
    rm -rf node_modules
    rm -rf client/node_modules
    rm -rf client/build
    rm -rf logs/*
    rm -rf uploads/*
    
    print_success "Cleanup completed"
}

# Function to start production
start_production() {
    print_status "Starting production servers..."
    
    if [ ! -d "client/build" ]; then
        print_error "Frontend not built. Run '$0 --build' first."
        exit 1
    fi
    
    if [ "$DOCKER_AVAILABLE" = true ] && [ "$DOCKER_COMPOSE_AVAILABLE" = true ]; then
        print_status "Starting all services with Docker Compose..."
        docker-compose up -d
        print_success "Production services started"
        print_status "Frontend: http://localhost:3000"
        print_status "Backend: http://localhost:5000"
        print_status "MongoDB: localhost:27017"
        print_status "Redis: localhost:6379"
    else
        print_status "Starting backend server..."
        NODE_ENV=production npm start
    fi
}

# Main script logic
main() {
    case "${1:-}" in
        -h|--help)
            show_usage
            exit 0
            ;;
        -i|--install)
            print_status "Starting installation..."
            check_requirements
            create_env_file
            create_directories
            install_backend
            install_frontend
            setup_database
            print_success "Installation completed successfully!"
            print_status "Next steps:"
            echo "  1. Edit .env file with your configuration"
            echo "  2. Run '$0 --dev' to start development servers"
            echo "  3. Run '$0 --test' to run tests"
            ;;
        -d|--dev)
            install_backend
            install_frontend
            start_development
            ;;
        -t|--test)
            install_backend
            install_frontend
            run_tests
            ;;
        -b|--build)
            install_backend
            install_frontend
            build_frontend
            ;;
        -c|--clean)
            cleanup
            ;;
        -s|--start)
            start_production
            ;;
        "")
            show_usage
            exit 1
            ;;
        *)
            print_error "Unknown option: $1"
            show_usage
            exit 1
            ;;
    esac
}

# Run main function with all arguments
main "$@"
