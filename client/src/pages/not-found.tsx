import { Link } from "wouter";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="text-center space-y-6 p-8">
        <div className="text-9xl font-bold text-primary">404</div>
        <h1 className="text-4xl font-bold text-foreground">Page Not Found</h1>
        <p className="text-xl text-muted-foreground max-w-md mx-auto">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <Link href="/">
          <Button size="lg" className="mt-4">
            Return to Home
          </Button>
        </Link>
      </div>
    </div>
  );
}
