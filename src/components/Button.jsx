import React from "react";
import "./button.css";

const Button = ({ name, onClick, bgColor, disabled = false }) => {
  return (
    <div className="button-container">
      <button
        style={{ backgroundColor: bgColor }}
        className="button"
        onClick={onClick}
        disabled={disabled}
      >
        {name}
      </button>
    </div>
  );
};

export default Button;
