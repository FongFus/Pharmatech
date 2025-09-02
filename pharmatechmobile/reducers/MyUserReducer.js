const ACTION_TYPES = {
  LOGIN: 'login',
  LOGOUT: 'logout',
};

const MyUserReducer = (state, action) => {
  switch (action.type) {
    case ACTION_TYPES.LOGIN:
      return action.payload;
    case ACTION_TYPES.LOGOUT:
      return null;
    default:
      return state;
  }
};

export default MyUserReducer;
