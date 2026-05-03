import React from "react";
import { Box, Typography, Breadcrumbs, Link } from "@mui/material";
import NavigateNextIcon from '@mui/icons-material/NavigateNext';
import { useDroppable } from "@dnd-kit/core";

const BreadcrumbDropTarget = ({ path, children, onClick, isLast }) => {
  const dropId = `breadcrumb|${path.join("/")}`;
  const { isOver, setNodeRef } = useDroppable({
    id: dropId,
  });

  return (
    <Box
      ref={setNodeRef}
      sx={{
        display: "inline-flex",
        alignItems: "center",
        px: isOver ? "6px" : "0px",
        py: isOver ? "2px" : "0px",
        borderRadius: "8px",
        backgroundColor: isOver ? "rgba(89, 178, 255, 0.14)" : "transparent",
        transition: "background-color 120ms ease",
      }}
    >
      {isLast ? (
        <Typography sx={{ fontSize: "16px" }} fontWeight="bold">
          {children}
        </Typography>
      ) : (
        <Link
          component="button"
          variant="body1"
          underline="hover"
          color="inherit"
          onClick={onClick}
          sx={{ cursor: "pointer" }}
        >
          {children}
        </Link>
      )}
    </Box>
  );
};

export const FileSystemBreadcrumbs = ({ currentPath, setCurrentPath }) => {
  const handleClick = (index) => {
    // Update the path to the selected directory
    setCurrentPath(currentPath.slice(0, index + 1));
  };

  return (
    <Breadcrumbs         separator={<NavigateNextIcon fontSize="small" />}
    aria-label="breadcrumb">
      {currentPath.map((dir, index) => {
        const isLast = index === currentPath.length - 1;
        const path = currentPath.slice(0, index + 1);
        return (
          <BreadcrumbDropTarget
            key={index}
            path={path}
            isLast={isLast}
            onClick={() => handleClick(index)}
          >
            {dir}
          </BreadcrumbDropTarget>
        );
      })}
    </Breadcrumbs>
  );
};
