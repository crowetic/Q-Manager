import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Box, List, ListItem, ListItemButton, ListItemIcon, ListItemText, Menu, MenuItem, Modal, Typography, styled } from '@mui/material';
import PushPinIcon from '@mui/icons-material/PushPin';
import FolderIcon from "@mui/icons-material/Folder";
import DeleteIcon from '@mui/icons-material/Delete';
import DriveFileMoveIcon from '@mui/icons-material/DriveFileMove';
import DriveFileRenameOutlineIcon from '@mui/icons-material/DriveFileRenameOutline';
import VisibilityIcon from '@mui/icons-material/Visibility';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
const CustomStyledMenu = styled(Menu)(({ theme }) => ({
    '& .MuiPaper-root': {
        backgroundColor: '#f9f9f9',
        borderRadius: '12px',
        padding: theme.spacing(1),
        boxShadow: '0 5px 15px rgba(0, 0, 0, 0.2)',
    },
    '& .MuiMenuItem-root': {
        fontSize: '14px',
        color: '#444',
        transition: '0.3s background-color',
        '&:hover': {
            backgroundColor: '#f0f0f0',
        },
    },
}));

const getValueByKeys = (source, keys = []) => {
  if (!source || typeof source !== 'object') return undefined;
  for (const key of keys) {
    if (source[key] !== undefined && source[key] !== null) {
      return source[key];
    }
  }
  return undefined;
};

const normalizeResourceProperties = (properties) => {
  if (!properties || typeof properties !== 'object') return {};

  const filename = getValueByKeys(properties, ['filename', 'fileName']);
  const mimeType = getValueByKeys(properties, [
    'mimeType',
    'mime',
    'contentType',
    'mediaType',
  ]);
  const rawSize = getValueByKeys(properties, [
    'sizeInBytes',
    'size',
    'dataSize',
    'createdSize',
    'totalSize',
  ]);
  const qortalName = getValueByKeys(properties, ['name', 'qortalName', 'ownerName']);
  const title = getValueByKeys(properties, ['title']);
  const parsedSize = Number(rawSize);
  const sizeInBytes =
    Number.isFinite(parsedSize) && parsedSize >= 0 ? parsedSize : undefined;

  return {
    ...(filename ? { filename } : {}),
    ...(mimeType ? { mimeType } : {}),
    ...(sizeInBytes !== undefined ? { sizeInBytes } : {}),
    ...(qortalName ? { qortalName } : {}),
    ...(title ? { title } : {}),
  };
};

const buildResourcePropertyPayloads = (item) => {
  const basePayload = {
    action: 'GET_QDN_RESOURCE_PROPERTIES',
    service: item?.service,
    identifier: item?.identifier,
  };
  const ownerName = item?.qortalName || item?.name;
  if (!ownerName) {
    return [basePayload];
  }
  return [
    { ...basePayload, name: ownerName },
    { ...basePayload, qortalName: ownerName },
    basePayload,
  ];
};

export const ContextMenuPinnedFiles = ({ children, removeFile, removeDirectory, type, rename, fileSystem, 
moveNode, currentPath, item, onPreview, onHydrateMetadata, pinned, onTogglePin }) => {
    const [menuPosition, setMenuPosition] = useState(null);
    const longPressTimeout = useRef(null);
    const maxHoldTimeout = useRef(null);
    const preventClick = useRef(false);
    const [showMoveModal, setShowMoveModal] = useState(false);
    const [showInfoModal, setShowInfoModal] = useState(false);
    const [resourceProperties, setResourceProperties] = useState(null);
    const [resourcePropertiesError, setResourcePropertiesError] = useState('');
    const [isFetchingResourceProperties, setIsFetchingResourceProperties] = useState(false);
    const [targetPath, setTargetPath] = useState([]);
    const startTouchPosition = useRef({ x: 0, y: 0 }); // Track initial touch position
    const handleContextMenu = (event) => {
        event.preventDefault();
        event.stopPropagation();
        preventClick.current = true;
        setMenuPosition({
            mouseX: event.clientX,
            mouseY: event.clientY,
        });
    };

    const handleTouchStart = (event) => {

        const { clientX, clientY } = event.touches[0];
        startTouchPosition.current = { x: clientX, y: clientY };

        longPressTimeout.current = setTimeout(() => {
            preventClick.current = true;
          
            event.stopPropagation();
            setMenuPosition({
                mouseX: clientX,
                mouseY: clientY,
            });
        }, 500);

        // Set a maximum hold duration (e.g., 1.5 seconds)
        maxHoldTimeout.current = setTimeout(() => {
            clearTimeout(longPressTimeout.current);
        }, 1500);
    };

    const handleTouchMove = (event) => {

        const { clientX, clientY } = event.touches[0];
        const { x, y } = startTouchPosition.current;

        // Determine if the touch has moved beyond a small threshold (e.g., 10px)
        const movedEnough = Math.abs(clientX - x) > 10 || Math.abs(clientY - y) > 10;

        if (movedEnough) {
            clearTimeout(longPressTimeout.current);
            clearTimeout(maxHoldTimeout.current);
        }
    };

    const handleTouchEnd = (event) => {

        clearTimeout(longPressTimeout.current);
        clearTimeout(maxHoldTimeout.current);
        if (preventClick.current) {
            event.preventDefault();
            event.stopPropagation();
            preventClick.current = false;
        }
    };

    const handleClose = (e) => {
        if (e?.preventDefault) e.preventDefault();
        if (e?.stopPropagation) e.stopPropagation();
        setMenuPosition(null);
    };

    const renderDirectoryTree = (directories, currentPathParam = []) => {
        return directories.filter((fd)=> fd?.type === 'folder').map((dir) => {
          // Construct the fullPath by including the current directory or file name
          const fullPath = [...currentPathParam, dir.name];
          const currentFullPath = [...currentPathParam, item.name];

          // Determine if the current item is the selected one
          const isSelected = fullPath.join("/") === targetPath.join("/");
          const isCurrentDir = fullPath.join("/") === currentPath.join("/");
          const isHoveredDir = fullPath.join("/") === currentFullPath.join("/");
        //   const isItSelf = dir?.type === 'folder' && dir.name ===
          if(dir.type !== "folder" ) return null
      
          return (
            <Box key={fullPath.join("/")} sx={{ mb: 1 }}>
              {/* Render the current directory or file */}
              <ListItem disablePadding>
                <ListItemButton
                  onClick={() => {
                    if(isCurrentDir || isHoveredDir) return
                    setTargetPath(fullPath)
                  }}
                  sx={{
                    backgroundColor: (isCurrentDir || isHoveredDir) ? 'inherit' : isSelected ? "#1976d2" : "inherit",
                    color: (isCurrentDir || isHoveredDir) ? 'inherit' : isSelected ? "#ffffff" : "inherit",
                    "&:hover": {
                      backgroundColor: (isCurrentDir || isHoveredDir) ? 'inherit' :  "#1976d2",
                      color: (isCurrentDir || isHoveredDir) ? 'inherit' : "#ffffff" 
                    },
                    cursor: (isCurrentDir || isHoveredDir) ? 'default' : 'pointer'
                  }}
                >
                    {dir.type === "folder" && (
                        <>
                         <ListItemIcon>
                    
                           <FolderIcon sx={{ color: isSelected ? "#ffffff" : "inherit" }} />
                   
                       </ListItemIcon>
                       <ListItemText
                         primary={dir.name}
                         primaryTypographyProps={{
                           fontWeight: isSelected ? "bold" : "normal",
                         }}
                       />
                       </>
                    )}
                 
                </ListItemButton>
              </ListItem>
              {/* Recursively render children if it's a folder */}
              {dir.type === "folder" && dir.children && dir.children.length > 0 && (
                <Box sx={{ pl: 4 }}>
                  {renderDirectoryTree(dir.children, fullPath)}
                </Box>
              )}
            </Box>
          );
        });
      };
      
      
      
      
      
      
      
      
      
      
      

      const openMoveModal = () => {
        setShowMoveModal(true);
        setMenuPosition(null); // Close the context menu
      };
    
      const closeMoveModal = () => {
        setShowMoveModal(false);
      };
      const closeInfoModal = () => {
        setShowInfoModal(false);
      };

      const hasKnownFileMetadata = useMemo(() => {
        if (type !== 'file') return true;
        const existingSize = getValueByKeys(item, [
          'sizeInBytes',
          'size',
          'fileSize',
          'dataSize',
          'createdSize',
          'totalSize',
        ]);
        return Boolean(item?.mimeType) && existingSize !== undefined;
      }, [
        item?.mimeType,
        item?.sizeInBytes,
        item?.size,
        item?.fileSize,
        item?.dataSize,
        item?.createdSize,
        item?.totalSize,
        type,
      ]);

      const mergedItemInfo = useMemo(() => {
        if (!resourceProperties) return item;
        return {
          ...item,
          fetchedResourceProperties: resourceProperties,
        };
      }, [item, resourceProperties]);

      const fetchResourceProperties = async () => {
        if (type !== 'file' || !item?.service || !item?.identifier) {
          return;
        }

        setIsFetchingResourceProperties(true);
        setResourcePropertiesError('');

        const payloadAttempts = buildResourcePropertyPayloads(item);
        let lastError = null;

        for (const payload of payloadAttempts) {
          try {
            const response = await qortalRequest(payload);
            if (response === undefined || response === null) {
              continue;
            }

            setResourceProperties(response);
            const normalized = normalizeResourceProperties(response);
            const metadataToHydrate = { ...normalized };
            if (
              normalized?.filename &&
              (!item?.displayName ||
                item?.displayName === item?.name ||
                item?.displayName === item?.identifier)
            ) {
              metadataToHydrate.displayName = normalized.filename;
            }
            if (
              onHydrateMetadata &&
              typeof onHydrateMetadata === 'function' &&
              Object.keys(metadataToHydrate).length > 0
            ) {
              onHydrateMetadata(metadataToHydrate);
            }
            setIsFetchingResourceProperties(false);
            return;
          } catch (error) {
            lastError = error;
          }
        }

        setResourcePropertiesError(
          lastError?.error ||
            lastError?.message ||
            'Unable to fetch live QDN properties'
        );
        setIsFetchingResourceProperties(false);
      };

      useEffect(() => {
        setResourceProperties(null);
        setResourcePropertiesError('');
        setIsFetchingResourceProperties(false);
      }, [item?.identifier, item?.service, item?.qortalName, item?.name]);

      useEffect(() => {
        if (!showInfoModal) return;
        if (type !== 'file') return;
        if (isFetchingResourceProperties) return;
        if (resourceProperties) return;
        if (hasKnownFileMetadata) return;
        fetchResourceProperties();
      }, [
        showInfoModal,
        type,
        isFetchingResourceProperties,
        resourceProperties,
        hasKnownFileMetadata,
      ]);

      const handleMove = () => {
        if (targetPath.length > 0) {
          moveNode("name", "type", ["current", "path"], targetPath); // Replace with your logic
          closeMoveModal();
        }
      };

    return (
        <div
            onContextMenu={handleContextMenu}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
            style={{ touchAction: 'none' }}
        >
            {children}
            <CustomStyledMenu
                disableAutoFocusItem
                open={!!menuPosition}
                onClose={handleClose}
                anchorReference="anchorPosition"
                anchorPosition={
                    menuPosition
                        ? { top: menuPosition.mouseY, left: menuPosition.mouseX }
                        : undefined
                }
                onClick={(e) => {
                    e.stopPropagation();
                }}
            > 
            {type === 'file' && !!onPreview && (
                <MenuItem onClick={(e) => {
                    handleClose(e);
                    onPreview()
                }}>
                    <ListItemIcon sx={{ minWidth: '32px' }}>
                        <VisibilityIcon fontSize="small" />
                    </ListItemIcon>
                    <Typography variant="inherit" sx={{ fontSize: '14px' }}>
                        preview
                    </Typography>
                </MenuItem>
            )}
            {type === 'file' && (
                <MenuItem onClick={(e) => {
                    handleClose(e);
                    onTogglePin?.();
                }}>
                    <ListItemIcon sx={{ minWidth: '32px' }}>
                        <PushPinIcon fontSize="small" />
                    </ListItemIcon>
                    <Typography variant="inherit" sx={{ fontSize: '14px' }}>
                        {pinned ? 'unpin file' : 'pin file'}
                    </Typography>
                </MenuItem>
            )}
            {type === 'file' && (
                <MenuItem onClick={(e) => {
                    handleClose(e);
                    removeFile()
                }}>
                    <ListItemIcon sx={{ minWidth: '32px' }}>
                        <DeleteIcon fontSize="small" />
                    </ListItemIcon>
                    <Typography variant="inherit" sx={{ fontSize: '14px' }}>
                        remove file
                    </Typography>
                </MenuItem>
            )}
            {type === 'folder' && (
                <MenuItem onClick={(e) => {
                    handleClose(e);
                    removeDirectory()
                }}>
                    <ListItemIcon sx={{ minWidth: '32px' }}>
                        <DeleteIcon fontSize="small" />
                    </ListItemIcon>
                    <Typography variant="inherit" sx={{ fontSize: '14px' }}>
                        remove directory
                    </Typography>
                </MenuItem>
                
            )}
                 <MenuItem onClick={(e) => {
                    handleClose(e);
                    rename()
                }}>
                    <ListItemIcon sx={{ minWidth: '32px' }}>
                        <DriveFileRenameOutlineIcon fontSize="small" />
                    </ListItemIcon>
                    <Typography variant="inherit" sx={{ fontSize: '14px' }}>
                    rename
                    </Typography>
                </MenuItem>
                <MenuItem
           onClick={() =>
            openMoveModal()
          }
        >
          <ListItemIcon sx={{ minWidth: "32px" }}>
            <DriveFileMoveIcon fontSize="small" />
          </ListItemIcon>
          <Typography variant="inherit" sx={{ fontSize: "14px" }}>
            Move
          </Typography>
        </MenuItem>
        <MenuItem
          onClick={(e) => {
            handleClose(e);
            setShowInfoModal(true);
          }}
        >
          <ListItemIcon sx={{ minWidth: "32px" }}>
            <InfoOutlinedIcon fontSize="small" />
          </ListItemIcon>
          <Typography variant="inherit" sx={{ fontSize: "14px" }}>
            More info
          </Typography>
        </MenuItem>
            </CustomStyledMenu>

            <Modal open={showMoveModal} onClose={closeMoveModal}>
        <Box
          sx={{
            width: 400,
            maxWidth: '95%',
            margin: "auto",
            marginTop: "10%",
            backgroundColor: "#27282c",
            border: "2px solid #000",
            boxShadow: 24,
            p: 4,
            overflow: 'auto',
            maxHeight: '80vh'
          }}
        >
          <Typography variant="h6" component="h2">
            Select Target Folder
          </Typography>
          {renderDirectoryTree(fileSystem)}
          <Box mt={2} sx={{
            display: 'flex',
            gap: '10px',
            alignItems: 'center'
          }}>
            <button onClick={()=> {


              if(!targetPath || targetPath?.length === 0) return
                moveNode(
                    item.name,
                   item.type,
                  currentPath,
                    targetPath // Pass the selected targetPath
                  )
            }}>Move Here</button>
            <button onClick={closeMoveModal}>Cancel</button>
          </Box>
        </Box>
      </Modal>
      <Modal open={showInfoModal} onClose={closeInfoModal}>
        <Box
          sx={{
            width: 520,
            maxWidth: "95%",
            margin: "auto",
            marginTop: "8%",
            backgroundColor: "#27282c",
            border: "1px solid #3a3f50",
            borderRadius: "10px",
            boxShadow: 24,
            p: 3,
            overflow: "auto",
            maxHeight: "80vh",
          }}
        >
          <Typography sx={{ fontSize: "18px", mb: 1 }}>Item details</Typography>
          <Typography sx={{ fontSize: "13px", opacity: 0.75, mb: 2 }}>
            Showing all known metadata for this item.
          </Typography>
          {type === 'file' && (
            <Box sx={{ display: 'flex', gap: '10px', alignItems: 'center', mb: 2 }}>
              <button
                onClick={fetchResourceProperties}
                disabled={
                  isFetchingResourceProperties || !item?.service || !item?.identifier
                }
              >
                {isFetchingResourceProperties
                  ? 'Fetching properties...'
                  : 'Fetch QDN properties'}
              </button>
              {resourcePropertiesError && (
                <Typography sx={{ fontSize: "12px", color: "#ff8f8f" }}>
                  {resourcePropertiesError}
                </Typography>
              )}
            </Box>
          )}
          <Box
            component="pre"
            sx={{
              backgroundColor: "rgba(0,0,0,0.2)",
              borderRadius: "8px",
              p: 2,
              fontSize: "12px",
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
              color: "#d7e0ef",
            }}
          >
            {JSON.stringify(mergedItemInfo, null, 2)}
          </Box>
          <Box mt={2}>
            <button onClick={closeInfoModal}>Close</button>
          </Box>
        </Box>
      </Modal>
        </div>
    );
};
