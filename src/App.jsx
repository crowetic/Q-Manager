import { useCallback, useEffect, useState } from "react";
import { Box, CircularProgress, CssBaseline, ThemeProvider, Typography, createTheme } from "@mui/material";
import "./App.css";
import { Manager } from "./Manager";
import { Toaster } from "react-hot-toast";

const theme = createTheme({
  palette: {
    text: {
      primary: "#ffffff", // Set primary text color to white
      secondary: "#cccccc", // Optional: Set secondary text color to a lighter shade
    },
    background: {
      default: "rgb(39, 40, 44)", // Optional: Set the default background to white
      paper: "rgba(0, 0, 0, 0.1)", // Optional: Set card/paper background to white
    },
  },
  typography: {
    allVariants: {
      color: "#ffffff", // Ensure all text uses white color by default
    },
  },
});

function App() {

  const [myAddress, setMyaddress] = useState('')
  const [isLoading, setIsloading] = useState(true)
  const [groups, setGroups] = useState([])
  const [ownedNames, setOwnedNames] = useState([])
  const [activeName, setActiveName] = useState("")

  const normalizeName = useCallback((entry) => {
    if (typeof entry === "string") return entry.trim();
    if (entry && typeof entry === "object" && typeof entry.name === "string") {
      return entry.name.trim();
    }
    return "";
  }, []);

  const extractPrimaryName = useCallback((payload) => {
    if (Array.isArray(payload)) {
      for (const item of payload) {
        const nameValue = normalizeName(item);
        if (nameValue) return nameValue;
      }
      return "";
    }
    return normalizeName(payload);
  }, [normalizeName]);
  const askForAccountInformation = useCallback(async () => {
    try {
      const account = await qortalRequest({
        action: "GET_USER_ACCOUNT",
      });
      if(account?.address){
        let names = []
        const nameData = await qortalRequest({
          action: "GET_ACCOUNT_NAMES",
          address: account.address,
        });
        if (Array.isArray(nameData)) {
          names = nameData.map((entry) => normalizeName(entry)).filter(Boolean);
        }
        let primaryName = "";
        try {
          const primaryNameData = await qortalRequest({
            action: "GET_PRIMARY_NAME",
            address: account.address,
          });
          primaryName = extractPrimaryName(primaryNameData);
        } catch (error) {
          try {
            const primaryNameData = await qortalRequest({
              action: "GET_PRIMARY_NAME",
            });
            primaryName = extractPrimaryName(primaryNameData);
          } catch (innerError) {}
        }
        const resolvedName = primaryName || names[0] || "";
        setOwnedNames(names);
        setActiveName((prev) => {
          if (prev && names.includes(prev)) return prev;
          return resolvedName;
        });
        setMyaddress({...account, name: resolvedName ? { name: resolvedName } : ""})
      }
    } catch (error) {
      console.error(error);
    } finally {
      setIsloading(false)
    }
  }, [extractPrimaryName, normalizeName]);

  const getGroups = useCallback(async (address) => {
    try {
      const res = await fetch(`/groups/member/${address}`);
   
        const data = await res.json()
        setGroups(data)
      
    } catch (error) {
      console.error(error);
    } finally {
      setIsloading(false)
    }
  }, []);

  useEffect(()=> {
    askForAccountInformation()
  }, [askForAccountInformation])

  useEffect(()=> {
    if(myAddress?.address){
      getGroups(myAddress?.address)
    }
  }, [myAddress?.address])

  useEffect(() => {
    if (!myAddress?.address) return;
    setMyaddress((prev) => {
      if (!prev?.address) return prev;
      const nextName = activeName ? { name: activeName } : "";
      if (prev?.name?.name === nextName?.name) return prev;
      return {
        ...prev,
        name: nextName,
      };
    });
  }, [activeName, myAddress?.address]);


  return (
    <ThemeProvider theme={theme}>
      <CssBaseline /> {/* Apply the background color globally */}
    <div className="container">
      
      {isLoading && (
        <Box sx={{
          height: '100vh',
          width: '100vw',
          justifyContent: 'center',
          alignItems: 'center',
          display: 'flex'
        }}>
        <CircularProgress />
        </Box>
      )}
      {!isLoading && !activeName && (
        <Box sx={{
          height: '100vh',
          width: '100vw',
          justifyContent: 'center',
          alignItems: 'center',
          display: 'flex'
          }}>
          <Typography sx={{
            fontSize: '18px'
            }}>
            To use Q-Manager you need a registered Qortal Name
          </Typography>
        </Box>
        
      )}
      {!isLoading && !!activeName && (
        <Manager
          myAddress={myAddress}
          groups={groups}
          ownedNames={ownedNames}
          activeName={activeName}
          onChangeActiveName={setActiveName}
        />
        )}
          <Toaster position="top-center"/>
    </div>
    </ThemeProvider>
  );
}

export default App;
