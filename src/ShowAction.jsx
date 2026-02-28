import {
  AppBar,
  Box,
  Dialog,
  IconButton,
  Slide,
  Toolbar,
  Typography,
} from "@mui/material";
import React, { useMemo } from "react";
import { VOTE_ON_POLL } from "./actions/VOTE_ON_POLL";
import { CREATE_POLL } from "./actions/CREATE_POLL";
import { PUBLISH_QDN_RESOURCE } from "./actions/PUBLISH_QDN_RESOURCE";
import { PUBLISH_MULTIPLE_QDN_RESOURCES } from "./actions/PUBLISH_MULTIPLE_QDN_RESOURCES";
import { OPEN_NEW_TAB } from "./actions/OPEN_NEW_TAB";
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
export const Transition = React.forwardRef(function Transition(props, ref) {
  return <Slide direction="up" ref={ref} {...props} />;
});

export const ShowAction = ({ selectedAction, handleClose, myName, addNodeByPath, mode , groups, selectedGroup, }) => {
  const ActionComponent = useMemo(() => {
    switch (selectedAction?.action) {
      
      case "PUBLISH_QDN_RESOURCE":
        return PUBLISH_QDN_RESOURCE;
      case "PUBLISH_MULTIPLE_QDN_RESOURCES":
        return PUBLISH_MULTIPLE_QDN_RESOURCES;
      default:
        return EmptyActionComponent;
    }
  }, [selectedAction?.action]);

  if (!selectedAction) return null;
  return (
    <div>
      <Dialog
        fullScreen
        open={!!selectedAction}
        onClose={handleClose}
        TransitionComponent={Transition}
        PaperProps={{
          style: {
            backgroundColor: "rgb(39, 40, 44)", 
            color: 'white !important'
          },
        }}

      >
        <AppBar sx={{ position: "relative", backgroundColor: "rgb(39, 40, 44)"}}>
          <Toolbar>
            <Typography sx={{ ml: 2, flex: 1 , fontSize: '16px'}}  component="div">
              {selectedAction?.action === 'PUBLISH_QDN_RESOURCE' && 'Publish file'} {`(${mode})`}
            </Typography>
            <IconButton
              edge="start"
              color="inherit"
              onClick={handleClose}
              aria-label="close"
            >
              <ExpandMoreIcon sx={{
                fontSize: '35px'
              }} />
            </IconButton>
          </Toolbar>
        </AppBar>
        <Box
          sx={{
            flexGrow: 1,
            overflowY: "auto",
          }}
        >
          <ActionComponent myName={myName} addNodeByPath={addNodeByPath} mode={mode} groups={groups} selectedGroup={selectedGroup} files={selectedAction?.files || []}/>
        </Box>
        {/* <LoadingSnackbar
          open={false}
          info={{
            message: "Loading member list with names... please wait.",
          }}
        /> */}
      </Dialog>
    </div>
  );
};

const EmptyActionComponent = () => {
  return null;
};
