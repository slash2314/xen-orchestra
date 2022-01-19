import React from 'react'
import { Switch, Route, RouteComponentProps } from 'react-router-dom'
import { withState } from 'reaclette'
import { withRouter } from 'react-router'
import Box from '@mui/material/Box'
import Tab from '@mui/material/Tab'
import TabContext from '@mui/lab/TabContext'
import TabList from '@mui/lab/TabList'
import TabPanel from '@mui/lab/TabPanel'

import Link from '../components/Link'

interface ParentState {}

interface State {
  pathname: string
}

interface TabType {
  component?: React.ReactNode
  pathname: string
  label: React.ReactNode
}

interface Props {
  // list= [
  //   {
  //      component: (<div>{contentA}</div>)
  //      pathname: '/path',
  //      label: (
  //        <span>
  //          <Icon icon='cloud' /> {labelA}
  //        </span>
  //      ),
  //   },
  // ]
  list: Array<TabType>
  history: RouteComponentProps['history']
}

interface ParentEffects {}

interface Effects {
  onChange: (event: React.SyntheticEvent, value: string) => void
}

interface Computed {}

// TODO: improve view as done in the model(figma).
const pageUnderConstruction = (
  <div style={{ color: '#0085FF', textAlign: 'center' }}>
    <h2>XOLite is under construction</h2>
    <h3>New features are coming soon !</h3>
  </div>
)

const Tabs = withState<State, Props, Effects, Computed, ParentState, ParentEffects>(
  {
    initialState: ({ list }) => ({ pathname: list[0].pathname }),
    effects: {
      onChange: function (event, pathname) {
        this.props.history.push(pathname)
        this.state.pathname = pathname
      },
    },
  },
  ({ effects, state: { pathname }, list }) => {
    // blue #0085FF
    // gray #E8E8E8

    /**
     * 
     * <Route
          path="/"
          render={({ location }) => (
            <Fragment>
              <Tabs value={location.pathname}>
                <Tab label="Item One" value="/" component={Link} to={allTabs[0]} />
                <Tab label="Item Two" value="/tab2" component={Link} to={allTabs[1]} />
                <Tab
                  value="/tab3"
                  label="Item Three"
                  component={Link}
                  to={allTabs[2]}
                />
              </Tabs>
              <Switch>
                <Route path={allTabs[1]} render={() => <div>Tab 2</div>} />
                <Route path={allTabs[2]} render={() => <div>Tab 3</div>} />
                <Route path={allTabs[0]} render={() => <div>Tab 1</div>} />
              </Switch>
            </Fragment>
          )}
        />
     */

    return (
      <TabContext value={pathname}>
        <Box sx={{ borderBottom: 1, borderColor: 'divider', background: '#FFFFFF', marginTop: '0.5em' }}>
          <TabList textColor='primary' indicatorColor='primary' onChange={effects.onChange} variant='standard'>
            {list.map((tab: TabType, index) => (
              <Tab key={index} label={tab.label} value={tab.pathname} />
            ))}
          </TabList>
        </Box>
        {list.map((tab: TabType) => (
          <TabPanel key={tab.pathname} value={tab.pathname}>
            {tab.component === undefined ? pageUnderConstruction : tab.component}
          </TabPanel>
        ))}
      </TabContext>
    )
  }
)

export default withRouter(Tabs)
