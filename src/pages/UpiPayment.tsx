import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { ThemeToggle } from "@/components/ui/ThemeToggle";

const UpiPayment = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  
  const [receiverName, setReceiverName] = useState("");
  const [receiverUpi, setReceiverUpi] = useState("");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  
  useEffect(() => {
    // Get payment details from URL parameters
    const name = searchParams.get("name");
    const upi = searchParams.get("upi");
    const amt = searchParams.get("amount");
    const noteParam = searchParams.get("note") || "Settling up via SplitStuff";
    
    if (name && upi && amt) {
      setReceiverName(name);
      setReceiverUpi(upi);
      setAmount(amt);
      setNote(noteParam);
    } else {
      // If parameters are missing, redirect back to home
      toast({
        title: "Invalid payment link",
        description: "Required payment details are missing.",
        variant: "destructive",
      });
      navigate("/");
    }
  }, [searchParams, navigate, toast]);

  const handlePayNow = () => {
    if (!receiverUpi) {
      toast({
        title: "UPI ID missing",
        description: "Receiver's UPI ID is not available.",
        variant: "destructive",
      });
      return;
    }

    // Check if on mobile device
    const isMobile = /Android|iPhone|iPad/i.test(navigator.userAgent || "");
    
    // Show warning if on desktop but allow proceeding
    if (!isMobile) {
      toast({
        title: "Best on mobile",
        description: "UPI apps work best on mobile devices, but you can try on desktop.",
        variant: "default", // Changed from destructive to default
      });
    }

    const amountNumber = Number(amount.replace(/,/g, ""));
    const params = new URLSearchParams();
    params.set("pa", receiverUpi);
    params.set("pn", receiverName);
    params.set("cu", "INR");
    if (!Number.isNaN(amountNumber) && amountNumber > 0) {
      params.set("am", amountNumber.toFixed(2));
    }
    if (note.trim()) {
      params.set("tn", note.trim());
    }

    const url = `upi://pay?${params.toString()}`;



    // Try to open UPI payment using a temporary link element
    try {
      const link = document.createElement('a');
      link.href = url;
      link.style.display = 'none';
      document.body.appendChild(link);
      
      // Programmatically click the link
      link.click();
      
      // Remove the link after a short delay
      setTimeout(() => {
        document.body.removeChild(link);
      }, 1000);
      
      // Show a message to the user
      toast({
        title: "Launching UPI app",
        description: "If the app doesn't open, make sure you have a UPI app installed.",
      });
      
    } catch (error) {
      console.error("UPI launch failed", error);
      toast({
        title: "Could not open UPI app",
        description: "Make sure you have a UPI app installed and try again.",
        variant: "destructive",
      });
    }
  };

  const currency = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" });

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_hsl(210_100%_97%),_hsl(280_100%_96%),_hsl(210_100%_97%))] font-sans">
      <header className="bg-transparent px-4 pt-10 pb-4">
        <div className="mx-auto flex max-w-md items-center justify-between gap-3">
          <Button
            variant="ghost"
            size="sm"
            className="rounded-full px-3 text-xs font-medium text-muted-foreground hover:text-foreground transition-all duration-200 hover:scale-105"
            onClick={() => navigate(-1)}
          >
            ← Back
          </Button>
          <h1 className="text-xl font-extrabold text-foreground">UPI Payment</h1>
          <div className="w-[64px]" aria-hidden />
        </div>
      </header>

      <main className="mx-auto max-w-md px-4 pb-20">
        <Card className="rounded-2xl border-0 shadow-md p-6">
          <div className="text-center mb-6">
            <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
              <span className="text-2xl">💳</span>
            </div>
            <h2 className="text-lg font-semibold text-foreground">Complete Payment</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Pay the exact amount to settle your dues
            </p>
          </div>

          <div className="space-y-4">
            <div className="bg-muted/50 rounded-xl p-4">
              <p className="text-xs text-muted-foreground mb-1">Receiver</p>
              <p className="font-semibold text-foreground">{receiverName}</p>
            </div>

            <div className="bg-muted/50 rounded-xl p-4">
              <p className="text-xs text-muted-foreground mb-1">UPI ID</p>
              <p className="font-mono text-sm text-foreground break-all">{receiverUpi}</p>
            </div>

            <div className="bg-muted/50 rounded-xl p-4">
              <p className="text-xs text-muted-foreground mb-1">Amount to pay</p>
              <p className="text-2xl font-bold text-primary">{currency.format(parseFloat(amount))}</p>
            </div>

            <div className="bg-muted/50 rounded-xl p-4">
              <p className="text-xs text-muted-foreground mb-1">Payment note</p>
              <p className="font-medium text-foreground">{note}</p>
            </div>
          </div>

          <div className="mt-8">
            <Button 
              className="w-full py-6 rounded-2xl text-base font-semibold" 
              onClick={handlePayNow}
            >
              Pay ₹{parseFloat(amount).toFixed(2)} via UPI
            </Button>
            
            <p className="text-xs text-center text-muted-foreground mt-3">
              This payment link is valid only for the specified amount
            </p>
          </div>
        </Card>
      </main>
    </div>
  );
};

export default UpiPayment;