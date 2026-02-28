import { useCallback, useEffect, useState } from "react";
import { Box, CircularProgress, CssBaseline, MenuItem, Select, ThemeProvider, Tooltip, Typography, createTheme } from "@mui/material";
import "./App.css";
import Container from "./components/Container";
import QSandboxLogo from "./assets/images/QSandboxLogo.png";
import InfoIcon from "@mui/icons-material/Info";
import { categories } from "./constants";
import { ShowCategories } from "./ShowCategories";
import { ShowAction } from "./ShowAction";
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
  const askForAccountInformation = useCallback(async () => {
    try {
      const account = await qortalRequest({
        action: "GET_USER_ACCOUNT",
      });
      if(account?.address){
        const nameData = await qortalRequest({
          action: "GET_ACCOUNT_NAMES",
          address: account.address,
        });
        setMyaddress({...account, name: nameData[0] || ""})
      }
    } catch (error) {
      console.error(error);
    } finally {
      setIsloading(false)
    }
  }, []);

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
  const handleClose = useCallback(()=> {
    setSelectedAction(null)
  }, [])

  useEffect(()=> {
    if(myAddress?.address){
      getGroups(myAddress?.address)
    }
  }, [myAddress?.address])


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
      {!isLoading && !myAddress?.name?.name && (
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
      {!isLoading && myAddress?.name?.name && (
        <Manager myAddress={myAddress} groups={groups} />
        )}
          <Toaster position="top-center"/>
    </div>
    </ThemeProvider>
  );
}

export default App;


